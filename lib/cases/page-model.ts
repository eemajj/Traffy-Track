import { isClosedTicketState } from "../tickets.ts";

type CaseListView = "pending" | "reopened" | "status-changed" | "unassigned" | "closed" | "all";
type CaseListSort = "updated-desc" | "updated-asc" | "received-desc" | "received-asc";

export const caseViewLabels: Record<CaseListView, string> = {
  pending: "เรื่องคงค้าง", reopened: "เปิดกลับรอบล่าสุด", "status-changed": "เปลี่ยนสถานะรอบล่าสุด",
  unassigned: "ไม่มีฝ่ายใน CityData", closed: "ปิดแล้ว", all: "ทั้งหมด"
};
export const caseViews: CaseListView[] = ["pending", "reopened", "status-changed", "unassigned", "closed", "all"];
export const casePageSizeOptions = [10, 50, 100];
export const caseSortLabels: Record<CaseListSort, string> = {
  "updated-desc": "อัปเดตล่าสุด: ใหม่ → เก่า", "updated-asc": "อัปเดตล่าสุด: เก่า → ใหม่",
  "received-desc": "วันที่รับแจ้ง: ใหม่ → เก่า", "received-asc": "วันที่รับแจ้ง: เก่า → ใหม่"
};

export function formatCaseDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}
export function formatCaseNumber(value: number | null) {
  return value === null || value === undefined ? "-" : new Intl.NumberFormat("th-TH").format(value);
}
export function formatCaseList(value: string[]) { return value.length > 0 ? value.join(" / ") : "-"; }
export function formatCaseDepartments(value: string[]) { return value.length > 0 ? value.join(" / ") : "ยังไม่มีฝ่าย"; }
export function formatCaseOrgResponse(value: string | null) {
  return value ? value.split(",").map((entry) => entry.trim()).filter(Boolean).join(" / ") : "-";
}
export function buildCasesHref(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && String(value).length > 0) search.set(key, String(value));
  const query = search.toString();
  return query ? `/cases?${query}` : "/cases";
}
export function getCaseStatusClassName(state: string | null) {
  if (!state) return "bg-surface text-muted";
  return isClosedTicketState(state) ? "bg-success/10 text-success" : "bg-warning/12 text-warning";
}
export function formatCaseChangeField(value: string) {
  const labels: Record<string, string> = {
    new_ticket: "เรื่องใหม่", reopened: "เปิดกลับ", state: "สถานะ", org_response: "หน่วยงาน",
    last_activity: "เวลาอัปเดต", timestamp: "วันที่รับเรื่อง", star: "คะแนนดาว", type: "ประเภท",
    comment: "รายละเอียด", photo_url: "รูปภาพ", address: "ที่อยู่", subdistrict: "แขวง", district: "เขต",
    province: "จังหวัด", hashtag: "แฮชแท็ก", coords: "พิกัด"
  };
  return labels[value] || value;
}
