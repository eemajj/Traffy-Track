import type { CsvColumnMap, CsvRow, RequiredCsvColumn, TicketRecord } from "./types.ts";
import { requiredCsvColumns } from "./types.ts";
import { parseCoordinates } from "../coordinates.ts";
import { getSafeHttpsUrl } from "../safe-url.ts";

const optionalCsvColumns = new Set<RequiredCsvColumn>([
  "photo",
  "address",
  "star",
  "hashtag",
  "coords"
]);

const csvColumnAliases: Partial<Record<RequiredCsvColumn, string[]>> = {
  ticket_id: ["ticket id", "ticketid"],
  photo: ["Photo", "photo_url", "photo url", "image", "image_url", "image url", "picture"],
  address: ["location", "address_detail", "address detail", "place"],
  org_response: ["org response", "orgresponse"],
  last_activity: ["last activity", "lastactivity"],
  star: ["stars", "rating", "score"],
  hashtag: ["hastag", "hash_tag", "hash tag", "tag", "tags"],
  coords: ["coord", "coordinate", "coordinates", "latlng", "lat_lng", "lat lng", "latitude_longitude"]
};

function cleanValue(value: string | undefined) {
  const normalized = (value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, "");
}

function normalizeHeaderKey(value: string) {
  return stripBom(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function getAcceptedHeaderKeys(column: RequiredCsvColumn) {
  return [column, ...(csvColumnAliases[column] || [])].map((alias) => normalizeHeaderKey(alias));
}

function parseTimestamp(value: string | undefined) {
  const normalized = cleanValue(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function parseInteger(value: string | undefined) {
  const normalized = cleanValue(value);
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function analyzeCsvColumns(columns: string[]) {
  const headerLookup = new Map<string, string>();

  for (const column of columns) {
    const normalizedColumn = normalizeHeaderKey(column);

    if (normalizedColumn && !headerLookup.has(normalizedColumn)) {
      headerLookup.set(normalizedColumn, column);
    }
  }

  const columnMap = {} as CsvColumnMap;
  const missingColumns: RequiredCsvColumn[] = [];
  const missingOptionalColumns: RequiredCsvColumn[] = [];

  for (const column of requiredCsvColumns) {
    const matchedColumn = getAcceptedHeaderKeys(column)
      .map((acceptedColumn) => headerLookup.get(acceptedColumn))
      .find((acceptedColumn): acceptedColumn is string => Boolean(acceptedColumn));

    if (!matchedColumn) {
      if (!optionalCsvColumns.has(column)) {
        missingColumns.push(column);
      } else {
        missingOptionalColumns.push(column);
      }
      continue;
    }

    columnMap[column] = matchedColumn;
  }

  return {
    columnMap,
    missingRequiredColumns: missingColumns,
    missingOptionalColumns
  };
}

export function validateCsvColumns(columns: string[]): CsvColumnMap {
  const analysis = analyzeCsvColumns(columns);

  if (analysis.missingRequiredColumns.length > 0) {
    throw new Error(`CSV is missing required columns: ${analysis.missingRequiredColumns.join(", ")}`);
  }

  return analysis.columnMap;
}

export function pickCsvRowValue(row: Record<string, string>, column: string | undefined) {
  if (!column) {
    return "";
  }

  return row[column] ?? row[stripBom(column).trim()] ?? "";
}

function getParsedExtraValues(row: Record<string, string>) {
  const parsedExtra = row.__parsed_extra as unknown;

  if (!Array.isArray(parsedExtra)) {
    return [];
  }

  return parsedExtra.map((value) => String(value));
}

export function normalizeCsvRow(row: Record<string, string>, columnMap: CsvColumnMap): CsvRow {
  return Object.fromEntries(
    requiredCsvColumns.map((column) => {
      const value = pickCsvRowValue(row, columnMap[column]);

      if (column === "coords") {
        const parsedExtraValues = getParsedExtraValues(row);
        return [column, parsedExtraValues.length > 0 ? [value, ...parsedExtraValues].join(",") : value];
      }

      return [column, value];
    })
  ) as CsvRow;
}

const DEFAULT_DISTRICT_NAME = "เขตทวีวัฒนา";

export function parseOrgList(orgResponse: string | undefined) {
  return (orgResponse || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function deriveDepartmentList(orgList: string[], districtName = DEFAULT_DISTRICT_NAME) {
  return orgList.filter(
    (entry) => entry.startsWith("ฝ่าย") && (entry.includes(districtName) || entry.includes("ทวีวัฒนา"))
  );
}

export function isDistrictRelatedTicket(
  ticket: { org_list: string[]; dept_list: string[]; district?: string | null; state?: string | null },
  districtName = DEFAULT_DISTRICT_NAME
): boolean {
  // 1. If dept_list has district department(s), it is district related
  if (ticket.dept_list && ticket.dept_list.length > 0) {
    return true;
  }

  // 2. If org_list contains district office or any district keyword
  if (ticket.org_list && ticket.org_list.length > 0) {
    if (ticket.org_list.some((entry) => entry.includes(districtName) || entry.includes("ทวีวัฒนา") || entry.startsWith("ฝ่าย"))) {
      return true;
    }
  }

  // 3. Keep tickets geofenced to district area (เขตทวีวัฒนา)
  if (ticket.district && (ticket.district.includes(districtName) || ticket.district.includes("ทวีวัฒนา"))) {
    return true;
  }

  // 4. Keep all intake & active pending tickets waiting for department assignment
  const state = (ticket.state || "").trim();
  if (!state || state === "รอรับเรื่อง" || state === "รับเรื่อง" || state === "ส่งต่อ(ใหม่)" || state === "กำลังดำเนินการ") {
    return true;
  }

  return false;
}

export function normalizeTicket(row: CsvRow): TicketRecord {
  const orgList = parseOrgList(row.org_response);
  const deptList = deriveDepartmentList(orgList);
  const coords = parseCoordinates(row.coords);

  return {
    ticket_id: row.ticket_id.trim(),
    type: cleanValue(row.type),
    comment: cleanValue(row.comment),
    photo_url: getSafeHttpsUrl(row.photo),
    address: cleanValue(row.address),
    subdistrict: cleanValue(row.subdistrict),
    district: cleanValue(row.district),
    province: cleanValue(row.province),
    timestamp: parseTimestamp(row.timestamp),
    last_activity: parseTimestamp(row.last_activity),
    state: cleanValue(row.state),
    org_response: cleanValue(row.org_response),
    org_list: orgList,
    dept_list: deptList,
    star: parseInteger(row.star),
    hashtag: cleanValue(row.hashtag),
    lat: coords.lat,
    lng: coords.lng
  };
}
