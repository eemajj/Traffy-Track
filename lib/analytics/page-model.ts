import { formatBangkokDate, formatBangkokDateTime } from "../date-utils.ts";

export const analyticsAgeBucketMeta = {
  "0_7": { label: "ไม่เกิน 7 วัน", shortLabel: "≤ 7 วัน", color: "bg-success", text: "text-success" },
  "8_30": { label: "8–30 วัน", shortLabel: "8–30 วัน", color: "bg-brand", text: "text-brand" },
  "31_90": { label: "31–90 วัน", shortLabel: "31–90 วัน", color: "bg-warning", text: "text-warning" },
  over_90: { label: "มากกว่า 90 วัน", shortLabel: "> 90 วัน", color: "bg-danger", text: "text-danger" },
  unknown: { label: "ไม่ทราบวันที่รับเรื่อง", shortLabel: "ไม่ทราบวัน", color: "bg-muted", text: "text-muted" }
} as const;
export function formatAnalyticsNumber(value: number) { return new Intl.NumberFormat("th-TH").format(value); }
export function formatAnalyticsDecimal(value: number) { return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 }).format(value); }
export function formatAnalyticsCoordinate(value: number) { return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 5, maximumFractionDigits: 5, useGrouping: false }).format(value); }
export function formatAnalyticsDate(value: string) { return formatBangkokDate(`${value}T00:00:00+07:00`, { day: "numeric", month: "short" }); }
export function formatAnalyticsDateTime(value: string) { return formatBangkokDateTime(value); }
export function formatAnalyticsDuration(hours: number | null) {
  if (hours === null) return "ยังไม่มีข้อมูล";
  return hours < 24 ? `${formatAnalyticsDecimal(hours)} ชม.` : `${formatAnalyticsDecimal(hours / 24)} วัน`;
}
export function formatAnalyticsChange(value: number | null) {
  if (value === null) return "ยังไม่มีฐานเปรียบเทียบ";
  return `${value > 0 ? "+" : ""}${formatAnalyticsDecimal(value)}%`;
}
