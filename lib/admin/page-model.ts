export const ESTIMATED_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
export function formatAdminDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
export function formatAdminNumber(value: number) { return new Intl.NumberFormat("th-TH").format(value); }
export function formatAdminBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) { value /= 1024; unitIndex += 1; }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}
export function getStoragePercent(bytes: number) { return Math.min(100, Math.round((bytes / ESTIMATED_STORAGE_LIMIT_BYTES) * 100)); }
export function getStorageTone(percent: number) {
  if (percent >= 85) return { arc: "from-success/70 via-warning to-danger", needle: "bg-danger", text: "text-danger", label: "ใกล้เต็ม" };
  if (percent >= 60) return { arc: "from-success/70 via-warning to-warning", needle: "bg-warning", text: "text-warning", label: "เริ่มสูง" };
  return { arc: "from-success via-success to-warning/70", needle: "bg-brand", text: "text-brand", label: "ปกติ" };
}
export function formatAdminImportStatus(status: string) {
  return status === "queued" ? "รอประมวลผล" : status === "running" ? "กำลังประมวลผล" : status === "failed" ? "ไม่สำเร็จ" : "สำเร็จ";
}
export function getAdminImportStatusClass(status: string) {
  return status === "queued" ? "bg-brand/10 text-brand" : status === "running" ? "bg-warning/10 text-warning" : status === "failed" ? "bg-danger/10 text-danger" : "bg-success/10 text-success";
}
export function getEnvironmentClass(isProduction: boolean) { return isProduction ? "bg-danger/10 text-danger" : "bg-brand/10 text-brand"; }
export function formatAuditAction(action: string) {
  const labels: Record<string, string> = {
    "backup.export": "สร้าง Backup ZIP", "system.wipe": "ล้างข้อมูลระบบ", "import.queued": "เริ่มงานนำเข้า",
    "import.completed": "นำเข้าเสร็จสิ้น", "import.failed": "นำเข้าไม่สำเร็จ",
    "access.passcode_profile_created": "สร้าง Passcode", "access.passcode_profile_updated": "แก้ไข Passcode/สิทธิ์",
    "access.passcode_profile_deleted": "ลบ Passcode"
  };
  return labels[action] || action;
}
