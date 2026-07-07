import { CsvRow, RequiredCsvColumn, TicketRecord, requiredCsvColumns } from "@/lib/import/types";

function cleanValue(value: string | undefined) {
  const normalized = (value || "").trim();
  return normalized.length > 0 ? normalized : null;
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

function parseCoords(value: string | undefined) {
  const normalized = cleanValue(value);
  if (!normalized) {
    return { lat: null, lng: null };
  }

  const parts = normalized.split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) {
    return { lat: null, lng: null };
  }

  return { lat: parts[0], lng: parts[1] };
}

export function validateCsvColumns(columns: string[]) {
  const trimmedColumns = columns.map((column) => column.trim());
  const missingColumns = requiredCsvColumns.filter((column) => !trimmedColumns.includes(column));

  if (missingColumns.length > 0) {
    throw new Error(`CSV is missing required columns: ${missingColumns.join(", ")}`);
  }

  return trimmedColumns;
}

export function pickCsvRowValue(row: Record<string, string>, column: RequiredCsvColumn) {
  return row[column] ?? row[column.trim()] ?? "";
}

export function normalizeCsvRow(row: Record<string, string>): CsvRow {
  return Object.fromEntries(
    requiredCsvColumns.map((column) => [column, pickCsvRowValue(row, column)])
  ) as CsvRow;
}

export function parseOrgList(orgResponse: string | undefined) {
  return (orgResponse || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function deriveDepartmentList(orgList: string[]) {
  return orgList.filter((entry) => entry.startsWith("ฝ่าย"));
}

export function normalizeTicket(row: CsvRow): TicketRecord {
  const orgList = parseOrgList(row.org_response);
  const deptList = deriveDepartmentList(orgList);
  const coords = parseCoords(row.coords);

  return {
    ticket_id: row.ticket_id.trim(),
    type: cleanValue(row.type),
    comment: cleanValue(row.comment),
    photo_url: cleanValue(row.photo),
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
