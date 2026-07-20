import Papa from "papaparse";

import { getCsvRowValidationIssues } from "@/lib/import/integrity";
import { analyzeCsvColumns, normalizeCsvRow } from "@/lib/import/normalize";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { IMPORT_BUCKET } from "@/lib/storage";

type CorrectionIssue = {
  rowNumber: number;
  ticketId: string;
  field: string;
  currentValue: string;
  issue: string;
  suggestedAction: string;
};

function csvValue(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function suggestedAction(field: string) {
  const actions: Record<string, string> = {
    ticket_id: "กรอก Ticket ID ที่ไม่ซ้ำและไม่เว้นว่าง",
    state: "กรอกสถานะปัจจุบันของเรื่อง",
    timestamp: "แก้เป็นวันเวลาที่ระบบอ่านได้ เช่น ISO 8601",
    last_activity: "แก้เป็นวันเวลาที่ระบบอ่านได้ เช่น ISO 8601",
    coords: "แก้เป็น longitude,latitude หรือ latitude,longitude ที่อยู่ในช่วงจริง",
    star: "กรอกจำนวนเต็มหรือเว้นว่าง",
    duplicate_ticket_id: "เก็บเพียงแถวเดียวต่อ Ticket ID",
    csv: "ตรวจเครื่องหมายคำพูด ตัวคั่น และจำนวนคอลัมน์ของแถว",
    header: "เพิ่มคอลัมน์ที่จำเป็นในแถวหัวตาราง"
  };
  return actions[field] || "ตรวจและแก้ค่าต้นทาง";
}

export async function createImportCorrectionArtifact(path: string) {
  const supabase = createSupabaseAdminClient();
  const download = await supabase.storage.from(IMPORT_BUCKET).download(path);
  if (download.error || !download.data) {
    throw new Error(`โหลดไฟล์เพื่อตรวจ correction ไม่สำเร็จ: ${download.error?.message || "ไม่พบไฟล์"}`);
  }

  const parsed = Papa.parse<Record<string, string>>(await download.data.text(), {
    header: true,
    skipEmptyLines: "greedy"
  });
  const headers = parsed.meta.fields || [];
  const columns = analyzeCsvColumns(headers);
  const issues: CorrectionIssue[] = columns.missingRequiredColumns.map((column) => ({
    rowNumber: 1,
    ticketId: "",
    field: "header",
    currentValue: column,
    issue: `ไม่พบคอลัมน์จำเป็น ${column}`,
    suggestedAction: suggestedAction("header")
  }));

  for (const error of parsed.errors) {
    issues.push({
      rowNumber: Number(error.row ?? 0) + 2,
      ticketId: "",
      field: "csv",
      currentValue: "",
      issue: error.message,
      suggestedAction: suggestedAction("csv")
    });
  }

  if (columns.missingRequiredColumns.length === 0) {
    const seen = new Set<string>();
    parsed.data.forEach((rawRow, index) => {
      const rowNumber = index + 2;
      const row = normalizeCsvRow(rawRow, columns.columnMap);
      const ticketId = row.ticket_id.trim();

      for (const issue of getCsvRowValidationIssues(row, rowNumber)) {
        issues.push({
          rowNumber,
          ticketId,
          field: issue.field,
          currentValue: row[issue.field as keyof typeof row] || "",
          issue: issue.message,
          suggestedAction: suggestedAction(issue.field)
        });
      }

      if (ticketId && seen.has(ticketId)) {
        issues.push({
          rowNumber,
          ticketId,
          field: "duplicate_ticket_id",
          currentValue: ticketId,
          issue: "Ticket ID ซ้ำกับแถวก่อนหน้า",
          suggestedAction: suggestedAction("duplicate_ticket_id")
        });
      }
      if (ticketId) seen.add(ticketId);
    });
  }

  const header = ["row_number", "ticket_id", "field", "current_value", "issue", "suggested_action"];
  const rows = issues.map((issue) => [
    issue.rowNumber,
    issue.ticketId,
    issue.field,
    issue.currentValue,
    issue.issue,
    issue.suggestedAction
  ]);
  const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvValue).join(",")).join("\r\n")}`;

  return { buffer: Buffer.from(csv, "utf8"), issueCount: issues.length };
}
