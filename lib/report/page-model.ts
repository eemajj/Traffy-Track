import { BANGKOK_TIME_ZONE } from "../report-date.ts";

export function formatReportDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: BANGKOK_TIME_ZONE }).format(new Date(value));
}
export function formatReportDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: BANGKOK_TIME_ZONE }).format(new Date(value));
}
export function formatReportNumber(value: number) { return new Intl.NumberFormat("th-TH").format(value); }
export function getArchiveEvidenceBadge(status: string | null, uploaded: boolean, legacy: boolean) {
  if (legacy) return uploaded ? { label: "มีไฟล์ตามเกณฑ์เดิม", className: "bg-warning/10 text-warning" } : { label: "ยังไม่ส่ง", className: "bg-danger/10 text-danger" };
  if (status === "approved") return { label: "อนุมัติแล้ว", className: "bg-success/10 text-success" };
  if (status === "rejected") return { label: "ตีกลับ", className: "bg-danger/10 text-danger" };
  if (uploaded) return { label: "รอตรวจ", className: "bg-warning/10 text-warning" };
  return { label: "ยังไม่ส่ง", className: "bg-danger/10 text-danger" };
}
export function buildReportHref(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && String(value).length > 0) search.set(key, String(value));
  const query = search.toString();
  return query ? `/report?${query}` : "/report";
}
