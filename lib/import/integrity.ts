import type {
  CsvColumnMap,
  CsvRow,
  ExistingTicketSnapshot,
  TicketRecord
} from "./types.ts";

export type ImportValidationIssue = {
  rowNumber: number;
  field: string;
  message: string;
};

export type TicketFieldChange = {
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
};

const optionalFieldMappings = [
  ["photo", "photo_url"],
  ["address", "address"],
  ["star", "star"],
  ["hashtag", "hashtag"]
] as const;

function clean(value: string | undefined) {
  return (value || "").trim();
}

function isValidTimestamp(value: string) {
  return !Number.isNaN(new Date(value).getTime());
}

function isValidCoordinates(value: string) {
  const parts = value.split(",").map((part) => Number(part.trim()));

  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) {
    return false;
  }

  const [first, second] = parts;
  return (
    (Math.abs(first) > 90 && Math.abs(first) <= 180 && Math.abs(second) <= 90) ||
    (Math.abs(first) <= 90 && Math.abs(second) <= 180)
  );
}

export function getCsvRowValidationIssues(row: CsvRow, rowNumber: number): ImportValidationIssue[] {
  const issues: ImportValidationIssue[] = [];

  if (!clean(row.ticket_id)) {
    issues.push({ rowNumber, field: "ticket_id", message: "ticket ID ว่าง" });
  }

  if (!clean(row.state)) {
    issues.push({ rowNumber, field: "state", message: "สถานะว่าง" });
  }

  for (const field of ["timestamp", "last_activity"] as const) {
    const value = clean(row[field]);
    if (value && !isValidTimestamp(value)) {
      issues.push({ rowNumber, field, message: "วันเวลาไม่ถูกต้อง" });
    }
  }

  const coords = clean(row.coords);
  if (coords && !isValidCoordinates(coords)) {
    issues.push({ rowNumber, field: "coords", message: "พิกัดไม่ถูกต้อง" });
  }

  const star = clean(row.star);
  if (star && (!/^-?\d+$/.test(star) || !Number.isSafeInteger(Number(star)))) {
    issues.push({ rowNumber, field: "star", message: "คะแนนต้องเป็นจำนวนเต็ม" });
  }

  return issues;
}

export function validateCsvRows(rows: CsvRow[]) {
  const issues = rows.flatMap((row, index) => getCsvRowValidationIssues(row, index + 2));

  if (issues.length === 0) {
    return;
  }

  const examples = issues
    .slice(0, 5)
    .map((issue) => `แถว ${issue.rowNumber} (${issue.field}): ${issue.message}`)
    .join("; ");
  const remaining = issues.length > 5 ? ` และอีก ${issues.length - 5} จุด` : "";

  throw new Error(`CSV มีข้อมูลไม่ถูกต้อง ${issues.length} จุด: ${examples}${remaining}`);
}

export function preserveMissingOptionalFields(
  incoming: TicketRecord,
  existing: ExistingTicketSnapshot,
  columnMap: CsvColumnMap
): TicketRecord {
  const merged = { ...incoming };

  for (const [csvField, ticketField] of optionalFieldMappings) {
    if (columnMap[csvField]) continue;

    if (ticketField === "photo_url") merged.photo_url = existing.photo_url;
    if (ticketField === "address") merged.address = existing.address;
    if (ticketField === "star") merged.star = existing.star;
    if (ticketField === "hashtag") merged.hashtag = existing.hashtag;
  }

  if (!columnMap.coords) {
    merged.lat = existing.lat;
    merged.lng = existing.lng;
  }

  return merged;
}

function stringifyValue(value: string | number | null) {
  return value === null || value === undefined ? null : String(value);
}

function timestampsEqual(left: string | null, right: string | null) {
  if (!left && !right) return true;
  if (!left || !right) return false;

  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isNaN(leftTime) || Number.isNaN(rightTime) ? left === right : leftTime === rightTime;
}

export function getTicketFieldChanges(
  existing: ExistingTicketSnapshot,
  incoming: TicketRecord
): TicketFieldChange[] {
  const changes: TicketFieldChange[] = [];
  const scalarFields = [
    "type",
    "comment",
    "photo_url",
    "address",
    "subdistrict",
    "district",
    "province",
    "state",
    "org_response",
    "star",
    "hashtag"
  ] as const;

  for (const field of scalarFields) {
    if ((existing[field] ?? null) !== (incoming[field] ?? null)) {
      changes.push({
        changed_field: field,
        old_value: stringifyValue(existing[field]),
        new_value: stringifyValue(incoming[field])
      });
    }
  }

  for (const field of ["timestamp", "last_activity"] as const) {
    if (!timestampsEqual(existing[field], incoming[field])) {
      changes.push({
        changed_field: field,
        old_value: stringifyValue(existing[field]),
        new_value: stringifyValue(incoming[field])
      });
    }
  }

  if ((existing.lat ?? null) !== (incoming.lat ?? null) || (existing.lng ?? null) !== (incoming.lng ?? null)) {
    changes.push({
      changed_field: "coords",
      old_value: existing.lat === null || existing.lng === null ? null : `${existing.lat},${existing.lng}`,
      new_value: incoming.lat === null || incoming.lng === null ? null : `${incoming.lat},${incoming.lng}`
    });
  }

  return changes;
}
