import type { SystemStatus } from "@/lib/system-status";

function formatDateTime(value: string | null) {
  if (!value) return "ยังไม่มีข้อมูลการนำเข้า";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function DataFreshnessBanner({ status, showAlerts }: { status: SystemStatus; showAlerts: boolean }) {
  return (
    <aside className="mb-5 flex flex-col gap-2 rounded-xl border border-border bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${status.maintenanceEnabled ? "bg-warning" : "bg-success"}`} aria-hidden="true" />
        <p className="min-w-0">
          <span className="font-semibold text-ink">ข้อมูลล่าสุด {formatDateTime(status.latestImportAt)}</span>
        {status.latestImportFilename ? (
          <span className="ml-2 text-muted">จาก {status.latestImportFilename}</span>
        ) : null}
          {status.maintenanceEnabled ? <span className="mt-1 block text-xs text-warning">{status.maintenanceMessage}</span> : null}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {status.maintenanceEnabled ? (
          <span className="rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">โหมดอ่านอย่างเดียว</span>
        ) : (
          <span className="text-xs font-semibold text-success">ระบบพร้อมใช้งาน</span>
        )}
        {showAlerts && status.openNotifications > 0 ? (
          <a href="/admin#notifications" className="rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger">
            แจ้งเตือน {status.openNotifications} รายการ
          </a>
        ) : null}
      </div>
    </aside>
  );
}
