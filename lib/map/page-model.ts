const THAI_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
export function getMapMarkerColor(state: string | null) {
  if (state === "เสร็จสิ้น" || state === "ไม่เกี่ยวข้อง" || state === "ส่งต่อ(ใหม่)") return "#1f7a5a";
  if (!state) return "#526b61";
  return "#94550b";
}
// Size differentiation keeps markers distinguishable without relying on color alone.
export function getMapMarkerRadius(state: string | null) {
  if (state === "เสร็จสิ้น" || state === "ไม่เกี่ยวข้อง" || state === "ส่งต่อ(ใหม่)") return 5;
  if (!state) return 6;
  return 8;
}
export function getMapStatusMeta(state: string | null) {
  if (state === "เสร็จสิ้น" || state === "ไม่เกี่ยวข้อง" || state === "ส่งต่อ(ใหม่)") return { label: state, className: "bg-success/10 text-success" };
  if (!state) return { label: "ไม่ระบุสถานะ", className: "bg-surface-strong text-muted" };
  return { label: state, className: "bg-warning/10 text-warning" };
}
export function formatMapDate(value: string | null) {
  if (!value) return "ไม่ระบุ";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "ไม่ระบุ" : THAI_DATE_TIME_FORMATTER.format(date);
}
export function getMapCaseHref(ticketId: string, returnTo: string) { return `/cases/${encodeURIComponent(ticketId)}?returnTo=${encodeURIComponent(returnTo)}`; }
export function buildVisibleMapPoints<T extends { ticket_id: string }>(points: T[], visibleTicketIds: string[] | null, limit = 100) {
  if (visibleTicketIds === null) return points.slice(0, limit);
  const pointById = new Map(points.map((point) => [point.ticket_id, point]));
  return visibleTicketIds.map((ticketId) => pointById.get(ticketId)).filter((point): point is T => Boolean(point)).slice(0, limit);
}
