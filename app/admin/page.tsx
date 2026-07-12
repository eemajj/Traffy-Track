import { AppShell } from "@/components/app-shell";
import { getAdminOverview } from "@/lib/admin";
import { getRecentAuditEvents } from "@/lib/audit";
import { AdminBackupPanel, AdminWipePanel } from "@/app/admin/admin-client";

export const dynamic = "force-dynamic";

const ESTIMATED_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function getStoragePercent(bytes: number) {
  return Math.min(100, Math.round((bytes / ESTIMATED_STORAGE_LIMIT_BYTES) * 100));
}

function getStorageTone(percent: number) {
  if (percent >= 85) {
    return {
      arc: "from-success/70 via-warning to-danger",
      needle: "bg-danger",
      text: "text-danger",
      label: "ใกล้เต็ม"
    };
  }

  if (percent >= 60) {
    return {
      arc: "from-success/70 via-warning to-warning",
      needle: "bg-warning",
      text: "text-warning",
      label: "เริ่มสูง"
    };
  }

  return {
    arc: "from-success via-success to-warning/70",
    needle: "bg-brand",
    text: "text-brand",
    label: "ปกติ"
  };
}

function formatImportStatus(status: string) {
  switch (status) {
    case "queued":
      return "รอประมวลผล";
    case "running":
      return "กำลังประมวลผล";
    case "failed":
      return "ไม่สำเร็จ";
    default:
      return "สำเร็จ";
  }
}

function getImportStatusClass(status: string) {
  switch (status) {
    case "queued":
      return "bg-brand/10 text-brand";
    case "running":
      return "bg-warning/10 text-warning";
    case "failed":
      return "bg-danger/10 text-danger";
    default:
      return "bg-success/10 text-success";
  }
}

function getEnvironmentClass(isProduction: boolean) {
  return isProduction ? "bg-danger/10 text-danger" : "bg-brand/10 text-brand";
}

function formatAuditAction(action: string) {
  const labels: Record<string, string> = {
    "backup.export": "สร้าง Backup ZIP",
    "system.wipe": "ล้างข้อมูลระบบ",
    "import.queued": "เริ่มงานนำเข้า",
    "import.completed": "นำเข้าเสร็จสิ้น",
    "import.failed": "นำเข้าไม่สำเร็จ"
  };

  return labels[action] || action;
}

function StorageGauge({ bytes, objectCount }: { bytes: number; objectCount: number }) {
  const percent = getStoragePercent(bytes);
  const tone = getStorageTone(percent);
  const rotation = -90 + percent * 1.8;

  return (
    <div className="mx-auto w-full max-w-72">
      <div className="relative aspect-[2/1] overflow-hidden">
        <div className={`absolute inset-0 rounded-t-full bg-gradient-to-r ${tone.arc}`} />
        <div className="absolute inset-x-[11%] top-[22%] bottom-[-78%] rounded-t-full bg-white" />
        <div className="absolute inset-x-[19%] top-[38%] bottom-[-62%] rounded-t-full bg-surface" />
        <div className="absolute bottom-0 left-1/2 h-[46%] w-1 origin-bottom -translate-x-1/2 rounded-full shadow-sm transition-transform duration-300"
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        >
          <div className={`h-full w-full rounded-full ${tone.needle}`} />
        </div>
        <div className="absolute bottom-0 left-1/2 h-4 w-4 -translate-x-1/2 translate-y-1/2 rounded-full border-4 border-white bg-ink shadow-sm" />
      </div>
      <div className="mt-3 text-center">
        <p className={`text-2xl font-semibold ${tone.text}`}>{percent}%</p>
        <p className="mt-1 text-xs font-semibold text-muted">{tone.label} · {formatNumber(objectCount)} objects</p>
      </div>
    </div>
  );
}

export default async function AdminPage() {
  const [data, audit] = await Promise.all([getAdminOverview(), getRecentAuditEvents(50)]);

  return (
    <AppShell
      title="ผู้ดูแลระบบ"
      description="ตรวจสุขภาพฐานข้อมูลและ Storage สร้าง backup ZIP และล้างข้อมูลเมื่อจำเป็น"
    >
      {data.status === "missing_env" ? (
        <section className="rounded-3xl border border-warning/20 bg-warning/10 p-6">
          <h2 className="text-xl font-bold text-warning">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-warning">ต้องตั้งค่า Supabase admin env ก่อนจึงจะใช้หน้า admin ได้</p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-3xl border border-danger/20 bg-danger/5 p-6">
          <h2 className="text-xl font-bold text-danger">Admin monitor ดึงข้อมูลไม่ได้ชั่วคราว</h2>
          <p className="mt-3 text-sm leading-6 text-danger">{data.message}</p>
        </section>
      ) : (
        <div className="space-y-6">
          <section className="rounded-3xl bg-white p-6 shadow-panel">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-ink">System health</h2>
                <p className="mt-2 text-sm leading-6 text-muted">ตรวจล่าสุด {formatDateTime(data.generatedAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getEnvironmentClass(data.deployment.isProduction)}`}>
                  {data.deployment.appEnvironment}
                </span>
                <span
                  className={
                    data.database.status === "ok"
                      ? "rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success"
                      : "rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger"
                  }
                >
                  Database {data.database.status}
                </span>
                <span
                  className={
                    data.storage.status === "ok"
                      ? "rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success"
                      : "rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger"
                  }
                >
                  Storage {data.storage.status}
                </span>
              </div>
            </div>

            {data.deployment.isProduction ? (
              <div className="mt-5 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger">
                Environment นี้เป็น production: ตรวจ backup และ preview/staging ให้เรียบร้อยก่อนใช้ action ที่เขียนหรือล้างข้อมูล
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-brand/15 bg-brand/5 px-4 py-3 text-sm leading-6 text-brand">
                Environment นี้ไม่ใช่ production เหมาะสำหรับทดสอบ feature, import preview, และ checklist ก่อน deploy
              </div>
            )}

            <div className="mt-6 grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs font-semibold text-muted">ฐานข้อมูล</p>
                <p className="mt-1 text-sm leading-6 text-ink">{data.limits.database}</p>
              </div>
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs font-semibold text-muted">Storage</p>
                <p className="mt-1 text-sm leading-6 text-ink">{data.limits.storage}</p>
              </div>
              <div className="rounded-2xl bg-surface px-4 py-3">
                <p className="text-xs font-semibold text-muted">หมายเหตุ</p>
                <p className="mt-1 text-sm leading-6 text-ink">{data.limits.note}</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-panel">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-ink">Operational attention</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  งานนำเข้าที่กำลังรันหรือไม่สำเร็จจะแสดงตรงนี้ก่อน เพื่อให้ admin เห็นปัญหาโดยไม่ต้องเปิด logs
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                  กำลังทำงาน {formatNumber(data.imports.activeCount)}
                </span>
                <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger">
                  ไม่สำเร็จ {formatNumber(data.imports.failedCount)}
                </span>
              </div>
            </div>

            {data.imports.recentJobs.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-border bg-surface px-4 py-5 text-sm leading-6 text-muted">
                ยังไม่มีประวัติการนำเข้า
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-2xl border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead className="bg-surface text-xs font-semibold text-muted">
                      <tr>
                        <th className="px-4 py-3">เวลา</th>
                        <th className="px-4 py-3">ไฟล์</th>
                        <th className="px-4 py-3">สถานะ</th>
                        <th className="px-4 py-3 text-right">แถว</th>
                        <th className="px-4 py-3">ข้อความ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-white">
                  {data.imports.recentJobs.map((job) => (
                        <tr key={job.importBatchId} className="motion-row">
                          <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(job.importedAt)}</td>
                          <td className="max-w-[260px] truncate px-4 py-3 font-semibold text-ink" title={job.filename}>
                            {job.filename}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getImportStatusClass(job.status)}`}>
                              {formatImportStatus(job.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-ink">{formatNumber(job.totalRows)}</td>
                          <td className="max-w-[360px] px-4 py-3 text-muted">
                            {job.errorMessage || `ใหม่ ${formatNumber(job.newTickets)} · เปลี่ยน ${formatNumber(job.changedTickets)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <section className="rounded-3xl bg-white p-6 shadow-panel">
              <h2 className="text-xl font-bold text-ink">Database tables</h2>
              <div className="mt-4 overflow-hidden rounded-2xl border border-border">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-surface text-xs font-semibold text-muted">
                    <tr>
                      <th className="px-4 py-3">ตาราง</th>
                      <th className="px-4 py-3 text-right">แถว</th>
                      <th className="px-4 py-3">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-white">
                    {data.database.tables.map((table) => (
                      <tr key={table.table} className="motion-row">
                        <td className="px-4 py-3 font-mono text-xs text-ink">{table.table}</td>
                        <td className="px-4 py-3 text-right font-semibold text-ink">{formatNumber(table.count)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{table.error || "ok"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-panel">
              <h2 className="text-xl font-bold text-ink">Storage buckets</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                {data.storage.buckets.map((bucket) => (
                  <div key={bucket.bucket} className="motion-card rounded-2xl border border-border bg-surface p-4">
                    <StorageGauge bytes={bucket.totalBytes} objectCount={bucket.objectCount} />
                    <div className="mt-4 flex items-end justify-between gap-4 border-t border-border pt-3">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold text-ink">{bucket.bucket}</p>
                        <p className="mt-1 text-xs text-muted">ประมาณจาก bucket objects</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-ink">{formatBytes(bucket.totalBytes)}</p>
                        <p className="mt-1 text-xs text-muted">/ {formatBytes(ESTIMATED_STORAGE_LIMIT_BYTES)}</p>
                      </div>
                    </div>
                    {bucket.error ? <p className="mt-2 text-xs leading-5 text-danger">{bucket.error}</p> : null}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <AdminBackupPanel />
          <AdminWipePanel isProduction={data.deployment.isProduction} environmentName={data.deployment.appEnvironment} />

          <section className="rounded-3xl bg-white p-6 shadow-panel">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-ink">Audit log</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  บันทึกการกระทำสำคัญของผู้ดูแลและเจ้าหน้าที่ เพื่อใช้ตรวจสอบเหตุการณ์ย้อนหลัง
                </p>
              </div>
              <span className="w-fit rounded-full bg-surface px-3 py-2 text-xs font-semibold text-muted">ล่าสุด 50 รายการ</span>
            </div>

            {audit.status === "ready" && audit.events.length > 0 ? (
              <div className="mt-5 overflow-hidden rounded-2xl border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                    <thead className="bg-surface text-xs font-semibold text-muted">
                      <tr>
                        <th className="px-4 py-3">เวลา</th>
                        <th className="px-4 py-3">ผู้ดำเนินการ</th>
                        <th className="px-4 py-3">การกระทำ</th>
                        <th className="px-4 py-3">รายการอ้างอิง</th>
                        <th className="px-4 py-3">ผลลัพธ์</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-white">
                      {audit.events.map((event) => (
                        <tr key={event.id} className="motion-row">
                          <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(event.occurredAt)}</td>
                          <td className="px-4 py-3 font-semibold text-ink">
                            {event.actorRole === "admin" ? "ผู้ดูแลระบบ" : event.actorRole === "operator" ? "เจ้าหน้าที่" : "ระบบ"}
                          </td>
                          <td className="px-4 py-3 text-ink">{formatAuditAction(event.action)}</td>
                          <td className="max-w-[280px] truncate px-4 py-3 font-mono text-xs text-muted" title={event.resourceId || event.resourceType}>
                            {event.resourceId || event.resourceType}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${event.outcome === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                              {event.outcome === "success" ? "สำเร็จ" : "ไม่สำเร็จ"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : audit.status === "ready" ? (
              <div className="mt-5 rounded-2xl border border-border bg-surface px-4 py-5 text-sm leading-6 text-muted">
                ยังไม่มีเหตุการณ์สำคัญ เมื่อมีการนำเข้า สร้าง backup หรือล้างข้อมูล ระบบจะแสดงประวัติที่นี่
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-warning/25 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning">
                Audit log ยังไม่พร้อมใช้งาน ต้อง apply migration `20260712153000_audit_events.sql` ก่อน
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
