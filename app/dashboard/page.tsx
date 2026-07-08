import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { getDashboardData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

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

function formatOrgResponse(value: string | null) {
  if (!value) {
    return "-";
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(" / ");
}

function formatDeptList(value: string[]) {
  return value.length > 0 ? value.join(" / ") : "ยังไม่มีฝ่าย";
}

function formatChangeValue(value: string | null, field: string) {
  if (!value) {
    return "-";
  }

  if (field === "org_response") {
    return formatOrgResponse(value);
  }

  if (field === "last_activity") {
    return formatDateTime(value);
  }

  return value;
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <AppShell
      title="ภาพรวมระบบ"
      description="สรุปเรื่องคงค้าง เรื่องที่รอจัดฝ่ายรับผิดชอบ และรายการเปลี่ยนแปลงสำคัญจากรอบนำเข้าล่าสุด"
    >
      {data.status === "missing_env" ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-bold text-amber-900">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-amber-900/80">
            หน้าภาพรวมระบบพร้อมดึงข้อมูลแล้ว แต่ต้องมี `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` ใน `.env.local`
            ก่อนจึงจะดึงข้อมูลจริงได้
          </p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-3xl border border-warning/20 bg-[rgba(201,131,34,0.12)] p-6">
          <h2 className="text-xl font-bold text-warning">หน้าภาพรวมระบบยังดึงข้อมูลไม่ได้ชั่วคราว</h2>
          <p className="mt-3 text-sm leading-6 text-warning">
            {data.message}
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-5">
            <section className="rounded-3xl bg-white p-6 shadow-panel">
              <p className="text-sm text-slate-500">เรื่องคงค้างทั้งหมด</p>
              <p className="mt-2 text-3xl font-bold">{formatNumber(data.pendingTicketCount)}</p>
            </section>
            <section className="rounded-3xl border border-danger/20 bg-danger/5 p-6">
              <p className="text-sm text-danger/80">รอจัดฝ่ายรับผิดชอบ</p>
              <p className="mt-2 text-3xl font-bold text-danger">{formatNumber(data.unassignedCount)}</p>
            </section>
            <section className="rounded-3xl bg-white p-6 shadow-panel">
              <p className="text-sm text-slate-500">เรื่องใหม่รอบล่าสุด</p>
              <p className="mt-2 text-3xl font-bold">{formatNumber(data.latestBatch?.new_tickets ?? 0)}</p>
            </section>
            <section className="rounded-3xl border border-warning/25 bg-warning/10 p-6">
              <p className="text-sm text-warning">เปิดกลับรอบล่าสุด</p>
              <p className="mt-2 text-3xl font-bold text-warning">{formatNumber(data.reopenedTicketCount)}</p>
            </section>
            <section className="rounded-3xl bg-white p-6 shadow-panel">
              <p className="text-sm text-slate-500">รายการเปลี่ยนสำคัญ</p>
              <p className="mt-2 text-3xl font-bold">{formatNumber(data.actionableChangeCount)}</p>
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-3xl bg-white p-6 shadow-panel">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">รอบนำเข้าล่าสุด</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    {data.latestBatch
                      ? `นำเข้าเมื่อ ${formatDateTime(data.latestBatch.imported_at)}`
                      : "ยังไม่มีรอบนำเข้าในระบบ"}
                  </p>
                </div>
                {data.latestBatch?.filename ? (
                  <span className="rounded-full bg-brand/10 px-4 py-2 text-xs font-semibold text-brand">
                    {data.latestBatch.filename}
                  </span>
                ) : null}
              </div>

              {data.latestBatch ? (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">แถวทั้งหมด</p>
                    <p className="mt-2 text-2xl font-bold">{formatNumber(data.latestBatch.total_rows)}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <p className="text-sm text-emerald-700">เรื่องใหม่</p>
                    <p className="mt-2 text-2xl font-bold text-emerald-900">{formatNumber(data.latestBatch.new_tickets)}</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-4">
                    <p className="text-sm text-amber-700">การเปลี่ยนทั้งหมด</p>
                    <p className="mt-2 text-2xl font-bold text-amber-900">{formatNumber(data.latestBatch.changed_tickets)}</p>
                    <p className="mt-1 text-xs leading-5 text-amber-800/80">ตัวเลขรวมจากรอบนำเข้าที่รวมเวลาอัปเดต จึงไม่ใช้เป็นรายการติดตาม</p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 p-4">
                    <p className="text-sm text-slate-600">ไม่เปลี่ยน</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{formatNumber(data.latestBatch.unchanged_tickets)}</p>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-panel">
              <h2 className="text-xl font-bold">เรื่องคงค้างแยกตามฝ่าย</h2>
              <div className="mt-4 space-y-3">
                {data.departmentSummary.length === 0 ? (
                  <p className="text-sm text-slate-500">ยังไม่มีข้อมูลฝ่ายที่มีเรื่องคงค้าง</p>
                ) : (
                  data.departmentSummary.map((row) => (
                    <div key={row.dept_name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <p className="pr-4 text-sm font-medium text-slate-700">{row.dept_name}</p>
                      <span className="rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white">
                        {formatNumber(row.pending_count)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <section className="rounded-3xl border border-danger/20 bg-danger/5 p-6">
              <h2 className="text-xl font-bold text-danger">รอจัดฝ่ายรับผิดชอบ</h2>
              <p className="mt-2 text-sm leading-6 text-danger/80">
                พบ {formatNumber(data.unassignedCount)} เรื่องคงค้างที่ยังไม่พบฝ่ายรับผิดชอบ จึงยังไม่รู้ว่าต้องส่งตามฝ่ายใด
              </p>
              <div className="mt-4 space-y-3">
                {data.unassignedTickets.length === 0 ? (
                  <p className="text-sm text-danger/80">ไม่มีเรื่องในหมวดนี้</p>
                ) : (
                  data.unassignedTickets.map((ticket) => (
                    <article key={ticket.ticket_id} className="rounded-2xl border border-danger/15 bg-white p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-mono text-xs text-slate-500">{ticket.ticket_id}</p>
                          <h3 className="mt-1 text-sm font-semibold text-slate-900">{ticket.state || "ไม่ระบุสถานะ"}</h3>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger">รอจัดฝ่าย</span>
                          <span className="text-xs text-slate-500">{formatDateTime(ticket.last_activity)}</span>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{ticket.comment || "-"}</p>
                      <div className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
                        <p>พื้นที่: {ticket.address || "-"}</p>
                        <p>หน่วยงานในข้อมูล: {formatOrgResponse(ticket.org_response)}</p>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-panel">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold">การเปลี่ยนแปลงที่ต้องดูรอบล่าสุด</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    แสดงเฉพาะเรื่องใหม่ สถานะ หน่วยงาน และคะแนนดาวจากรอบนำเข้าล่าสุด ไม่รวมเวลาอัปเดตที่ต่างกันเฉพาะรูปแบบเวลา
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/cases?view=reopened"
                    className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning hover:bg-warning/15"
                  >
                    ดูเรื่องเปิดกลับ
                  </Link>
                  <Link
                    href="/cases?view=status-changed"
                    className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning hover:bg-warning/15"
                  >
                    ดูเรื่องที่เปลี่ยนสถานะ
                  </Link>
                  <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">
                    {formatNumber(data.recentChanges.length)} เรื่องที่แสดง
                  </span>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {data.recentChanges.length === 0 ? (
                  <p className="rounded-2xl bg-surface p-4 text-sm leading-6 text-slate-600">
                    รอบล่าสุดไม่มีการเปลี่ยนแปลงสำคัญสำหรับเรื่องคงค้าง หรือมีเพียงเวลาอัปเดตที่ต่างกันเฉพาะรูปแบบเวลา
                  </p>
                ) : (
                  data.recentChanges.map((ticket) => (
                    <article key={ticket.ticket_id} className="rounded-2xl border border-border/80 bg-surface p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <Link
                            href={`/cases/${encodeURIComponent(ticket.ticket_id)}`}
                            className="font-mono text-xs font-semibold text-brand hover:text-brand-deep"
                          >
                            {ticket.ticket_id}
                          </Link>
                          <h3 className="mt-1 text-sm font-semibold text-slate-900">{ticket.state || "ไม่ระบุสถานะ"}</h3>
                        </div>
                        <span className="text-xs text-slate-500">{formatDateTime(ticket.detectedAt)}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{ticket.comment || "-"}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-600">
                          ฝ่าย: {formatDeptList(ticket.deptList)}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-slate-500">
                          พื้นที่: {ticket.address || "-"}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2">
                        {ticket.changes.map((change) => (
                          <div key={change.id} className="rounded-xl bg-white px-3 py-2 text-sm">
                            {change.field === "new_ticket" ? (
                              <p className="text-slate-700">
                                <span className="font-semibold text-success">{change.label}</span>
                                <span className="mx-2 text-slate-400">·</span>
                                เพิ่มเข้าระบบด้วยสถานะ {formatChangeValue(change.newValue, change.field)}
                              </p>
                            ) : change.field === "reopened" ? (
                              <p className="text-slate-700">
                                <span className="font-semibold text-warning">{change.label}</span>
                                <span className="mx-2 text-slate-400">จาก</span>
                                <span>{formatChangeValue(change.oldValue, change.field)}</span>
                                <span className="mx-2 text-slate-400">กลับเป็น</span>
                                <span>{formatChangeValue(change.newValue, change.field)}</span>
                              </p>
                            ) : (
                              <p className="text-slate-700">
                                <span className="font-semibold text-slate-900">{change.label}</span>
                                <span className="mx-2 text-slate-400">จาก</span>
                                <span>{formatChangeValue(change.oldValue, change.field)}</span>
                                <span className="mx-2 text-slate-400">เป็น</span>
                                <span>{formatChangeValue(change.newValue, change.field)}</span>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </AppShell>
  );
}
