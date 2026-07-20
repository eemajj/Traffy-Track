import Link from "next/link";

import { TraffyStatistics } from "@/app/dashboard/traffy-statistics";
import { AppShell } from "@/components/app-shell";
import { WorkflowActionCenter } from "@/components/workflow-action-center";
import { getDashboardData } from "@/lib/dashboard";
import { normalizeDashboardDateRange } from "@/lib/dashboard/statistics";
import { getDashboardStatistics } from "@/lib/dashboard/statistics-query";

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

  if (field === "last_activity" || field === "timestamp") {
    return formatDateTime(value);
  }

  return value;
}

type DashboardPageProps = {
  searchParams?: Promise<{
    from?: string | string[];
    to?: string | string[];
  }>;
};

export default async function DashboardPage(props: DashboardPageProps) {
  const searchParams = (await props.searchParams) || {};
  const range = normalizeDashboardDateRange(searchParams);
  const [data, statistics] = await Promise.all([
    getDashboardData(),
    getDashboardStatistics(range)
  ]);

  return (
    <AppShell
      title="ภาพรวมระบบ"
      description="สรุปสถานะเรื่องตามช่วงวันที่ด้วยสูตรเดียวกับ Traffy พร้อมงานคงค้างและรายการที่ต้องดำเนินการในระบบ"
    >
      <div className="space-y-10">
        <TraffyStatistics data={statistics} />

        <section aria-labelledby="local-operations-title" className="space-y-5">
          <div className="border-b border-border pb-4">
            <h2 id="local-operations-title" className="text-2xl font-semibold tracking-[-0.02em] text-ink">งานที่ต้องดำเนินการในระบบนี้</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">ติดตามรอบนำเข้า เรื่องที่ยังไม่มีฝ่าย และการเปลี่ยนแปลงล่าสุด โดยไม่ปะปนกับสถิติตามช่วงวันที่ด้านบน</p>
          </div>
      {data.status === "missing_env" ? (
        <section className="rounded-2xl border border-warning/20 bg-warning/10 p-6">
          <h2 className="text-xl font-bold text-warning">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-warning">
            หน้าภาพรวมระบบพร้อมดึงข้อมูลแล้ว แต่ต้องมี `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` ใน `.env.local`
            ก่อนจึงจะดึงข้อมูลจริงได้
          </p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-2xl border border-warning/20 bg-[rgba(201,131,34,0.12)] p-6">
          <h2 className="text-xl font-bold text-warning">หน้าภาพรวมระบบยังดึงข้อมูลไม่ได้ชั่วคราว</h2>
          <p className="mt-3 text-sm leading-6 text-warning">
            {data.message}
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          <dl aria-label="สรุปสถานะระบบ" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
            <div className="bg-white p-4 sm:p-5">
              <dt className="text-sm text-muted">เรื่องคงค้าง</dt>
              <dd className="mt-1 text-2xl font-semibold text-ink">{formatNumber(data.pendingTicketCount)}</dd>
            </div>
            <div className="bg-white p-4 sm:p-5">
              <dt className="text-sm text-muted">เรื่องใหม่รอบล่าสุด</dt>
              <dd className="mt-1 text-2xl font-semibold text-ink">{formatNumber(data.latestBatch?.new_tickets ?? 0)}</dd>
            </div>
            <div className="bg-white p-4 sm:p-5">
              <dt className="text-sm text-muted">ไม่มีฝ่ายใน CityData</dt>
              <dd className="mt-1 text-2xl font-semibold text-danger">{formatNumber(data.unassignedCount)}</dd>
            </div>
            <div className="bg-white p-4 sm:p-5">
              <dt className="text-sm text-muted">เปิดกลับรอบล่าสุด</dt>
              <dd className="mt-1 text-2xl font-semibold text-warning">{formatNumber(data.reopenedTicketCount)}</dd>
            </div>
          </dl>

          <WorkflowActionCenter items={data.actionCenter} />

          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-2xl border border-border bg-white p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">รอบนำเข้าล่าสุด</h2>
                  <p className="mt-2 text-sm text-muted">
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
                <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
                  <div className="bg-white p-4">
                    <dt className="text-xs text-muted">แถวทั้งหมด</dt>
                    <dd className="mt-1 text-xl font-semibold text-ink">{formatNumber(data.latestBatch.total_rows)}</dd>
                  </div>
                  <div className="bg-white p-4">
                    <dt className="text-xs text-success">เรื่องใหม่</dt>
                    <dd className="mt-1 text-xl font-semibold text-success">{formatNumber(data.latestBatch.new_tickets)}</dd>
                  </div>
                  <div className="bg-white p-4">
                    <dt className="text-xs text-warning">การเปลี่ยนทั้งหมด</dt>
                    <dd className="mt-1 text-xl font-semibold text-warning">{formatNumber(data.latestBatch.changed_tickets)}</dd>
                  </div>
                  <div className="bg-white p-4">
                    <dt className="text-xs text-muted">ไม่เปลี่ยน</dt>
                    <dd className="mt-1 text-xl font-semibold text-ink">{formatNumber(data.latestBatch.unchanged_tickets)}</dd>
                  </div>
                </dl>
              ) : null}
              {data.latestBatch ? (
                <p className="mt-3 text-xs leading-5 text-muted">“การเปลี่ยนทั้งหมด” รวมเวลาอัปเดต จึงใช้ดูภาพรวมรอบนำเข้า ไม่ใช่จำนวนงานที่ต้องติดตาม</p>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border bg-white p-6">
              <h2 className="text-xl font-bold">เรื่องคงค้างแยกตามฝ่าย</h2>
              <div className="mt-4 space-y-3">
                {data.departmentSummary.length === 0 ? (
                  <p className="text-sm text-muted">ยังไม่มีข้อมูลฝ่ายที่มีเรื่องคงค้าง</p>
                ) : (
                  data.departmentSummary.map((row) => (
                    <div key={row.dept_name} className="flex items-center justify-between border-b border-border px-1 py-3 last:border-b-0">
                      <p className="pr-4 text-sm font-medium text-ink">{row.dept_name}</p>
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
            <section className="rounded-2xl border border-warning/20 bg-warning/5 p-6">
              <h2 className="text-xl font-bold text-warning">ยังไม่มีฝ่ายในข้อมูล CityData</h2>
              <p className="mt-2 text-sm leading-6 text-warning">
                พบ {formatNumber(data.unassignedCount)} เรื่องคงค้างที่ไฟล์ต้นทางยังไม่ระบุฝ่าย ระบบแสดงเพื่อการตรวจสอบโดยไม่แก้ไขข้อมูลต้นทาง
              </p>
              <div className="mt-4 space-y-3">
                {data.unassignedTickets.length === 0 ? (
                  <p className="text-sm text-warning">ไม่มีเรื่องในหมวดนี้</p>
                ) : (
                  data.unassignedTickets.map((ticket) => (
                    <article key={ticket.ticket_id} className="rounded-xl border border-danger/15 bg-white p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-mono text-xs text-muted">{ticket.ticket_id}</p>
                          <h3 className="mt-1 text-sm font-semibold text-ink">{ticket.state || "ไม่ระบุสถานะ"}</h3>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">ไม่มีฝ่ายใน CityData</span>
                          <span className="text-xs text-muted">{formatDateTime(ticket.last_activity)}</span>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-ink">{ticket.comment || "-"}</p>
                      <div className="mt-3 space-y-1 text-xs leading-5 text-muted">
                        <p>พื้นที่: {ticket.address || "-"}</p>
                        <p>หน่วยงานในข้อมูล: {formatOrgResponse(ticket.org_response)}</p>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-white p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold">การเปลี่ยนแปลงที่ต้องดูรอบล่าสุด</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    แสดงเรื่องใหม่และทุกฟิลด์ธุรกิจที่เปลี่ยนจากรอบนำเข้าล่าสุด โดยไม่นับวันเวลาที่เป็นเวลาเดียวกันแต่เขียนคนละรูปแบบ
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/cases?view=reopened"
                    className="inline-flex min-h-11 items-center rounded-full bg-warning/10 px-3 py-2 text-xs font-semibold text-warning hover:bg-warning/15"
                  >
                    ดูเรื่องเปิดกลับ
                  </Link>
                  <Link
                    href="/cases?view=status-changed"
                    className="inline-flex min-h-11 items-center rounded-full bg-warning/10 px-3 py-2 text-xs font-semibold text-warning hover:bg-warning/15"
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
                  <p className="rounded-2xl bg-surface p-4 text-sm leading-6 text-muted">
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
                          <h3 className="mt-1 text-sm font-semibold text-ink">{ticket.state || "ไม่ระบุสถานะ"}</h3>
                        </div>
                        <span className="text-xs text-muted">{formatDateTime(ticket.detectedAt)}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-ink">{ticket.comment || "-"}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-white px-3 py-1 font-semibold text-muted">
                          ฝ่าย: {formatDeptList(ticket.deptList)}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1 text-muted">
                          พื้นที่: {ticket.address || "-"}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2">
                        {ticket.changes.map((change) => (
                          <div key={change.id} className="rounded-xl bg-white px-3 py-2 text-sm">
                            {change.field === "new_ticket" ? (
                              <p className="text-ink">
                                <span className="font-semibold text-success">{change.label}</span>
                                <span className="mx-2 text-border">·</span>
                                เพิ่มเข้าระบบด้วยสถานะ {formatChangeValue(change.newValue, change.field)}
                              </p>
                            ) : change.field === "reopened" ? (
                              <p className="text-ink">
                                <span className="font-semibold text-warning">{change.label}</span>
                                <span className="mx-2 text-muted">จาก</span>
                                <span>{formatChangeValue(change.oldValue, change.field)}</span>
                                <span className="mx-2 text-muted">กลับเป็น</span>
                                <span>{formatChangeValue(change.newValue, change.field)}</span>
                              </p>
                            ) : (
                              <p className="text-ink">
                                <span className="font-semibold text-ink">{change.label}</span>
                                <span className="mx-2 text-muted">จาก</span>
                                <span>{formatChangeValue(change.oldValue, change.field)}</span>
                                <span className="mx-2 text-muted">เป็น</span>
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
        </section>
      </div>
    </AppShell>
  );
}
