import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import {
  archiveReportBatchesAction,
  createReportBatchAction,
  deleteReportBatchAction,
  updateReportBatchAction
} from "@/app/report/actions";
import { CreateReportSubmitButton } from "@/app/report/create-report-submit-button";
import { ReportBatchSubmitButton } from "@/app/report/report-batch-submit-button";
import { getReportPageData } from "@/lib/report";
import { BANGKOK_TIME_ZONE, getBangkokCurrentMonthRange, getBangkokTodayValue } from "@/lib/report-date";

export const dynamic = "force-dynamic";

type ReportPageProps = {
  searchParams?: Promise<{
    status?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: BANGKOK_TIME_ZONE
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BANGKOK_TIME_ZONE
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function getArchiveEvidenceBadge(status: string | null, uploaded: boolean, legacy: boolean) {
  if (legacy) {
    return uploaded
      ? { label: "มีไฟล์ตามเกณฑ์เดิม", className: "bg-warning/10 text-warning" }
      : { label: "ยังไม่ส่ง", className: "bg-danger/10 text-danger" };
  }
  if (status === "approved") return { label: "อนุมัติแล้ว", className: "bg-success/10 text-success" };
  if (status === "rejected") return { label: "ตีกลับ", className: "bg-danger/10 text-danger" };
  if (uploaded) return { label: "รอตรวจ", className: "bg-warning/10 text-warning" };
  return { label: "ยังไม่ส่ง", className: "bg-danger/10 text-danger" };
}

function buildReportHref(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && String(value).length > 0) {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `/report?${query}` : "/report";
}

export default async function ReportPage(props: ReportPageProps) {
  const searchParams = await props.searchParams;
  const data = await getReportPageData(searchParams);
  const currentMonth = getBangkokCurrentMonthRange();

  return (
    <AppShell
      title="รอบรายงาน"
      description="สร้างรอบรายงานจากเรื่องคงค้างจริง แล้วติดตามความคืบหน้าของแต่ละฝ่ายในหน้าเดียว"
    >
      {data.status === "missing_env" ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-bold text-amber-900">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-amber-900/80">
            ต้องมี `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` ใน `.env.local` ก่อนจึงจะใช้งานรอบรายงานได้
          </p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-3xl border border-warning/20 bg-[rgba(201,131,34,0.12)] p-6">
          <h2 className="text-xl font-bold text-warning">รอบรายงานยังดึงข้อมูลไม่ได้ชั่วคราว</h2>
          <p className="mt-3 text-sm leading-6 text-warning">{data.message}</p>
        </section>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-4">
            <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
              <p className="text-sm text-muted">เรื่องคงค้างพร้อมรายงาน</p>
              <p className="mt-2 text-3xl font-semibold text-ink">{data.pendingTicketCount}</p>
            </section>
            <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
              <p className="text-sm text-muted">ฝ่ายที่มีงานคงค้าง</p>
              <p className="mt-2 text-3xl font-semibold text-ink">{data.departmentsReadyCount}</p>
            </section>
            <section className="rounded-[28px] border border-danger/20 bg-danger/5 p-6">
              <p className="text-sm text-danger/80">ยังไม่มีผู้รับผิดชอบ</p>
              <p className="mt-2 text-3xl font-semibold text-danger">{data.unassignedPendingCount}</p>
            </section>
            <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
              <p className="text-sm text-muted">รอบรายงานที่สร้างแล้ว</p>
              <p className="mt-2 text-3xl font-semibold text-ink">{data.status === "ready" ? formatNumber(data.batches.length) : 0}</p>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">สร้างรอบรายงานใหม่</h2>
                <p className="text-sm leading-6 text-muted">
                  ระบบจะบันทึกภาพรวมเรื่องคงค้าง ณ เวลานั้น แล้วสร้างรายการแยกตามฝ่ายในทันที
                </p>
              </div>

              <form action={createReportBatchAction} className="mt-6 space-y-4">
                <input type="hidden" name="idempotency_key" value={crypto.randomUUID()} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-ink">วันที่ของรอบรายงาน</span>
                    <input
                      type="date"
                      name="report_date"
                      defaultValue={getBangkokTodayValue()}
                      required
                      className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-ink outline-none focus:border-brand focus:bg-white focus:shadow-[0_0_0_4px_var(--ring)]"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-ink">หมายเหตุ</span>
                    <input
                      type="text"
                      name="note"
                      placeholder="เช่น รอบติดตามกลางเดือน"
                      className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-ink outline-none focus:border-brand focus:bg-white focus:shadow-[0_0_0_4px_var(--ring)]"
                    />
                  </label>
                </div>

                <CreateReportSubmitButton />
              </form>

              <div className="mt-6 rounded-2xl bg-surface p-4">
                <h3 className="text-sm font-semibold text-ink">ฝ่ายที่พร้อมออกรายงานตอนนี้</h3>
                <div className="mt-3 space-y-2">
                  {data.pendingDepartments.length === 0 ? (
                    <p className="text-sm text-muted">ยังไม่มีฝ่ายที่มีเรื่องคงค้างสำหรับการออกรายงาน</p>
                  ) : (
                    data.pendingDepartments.map((department) => (
                      <div
                        key={department.dept_name}
                        className="flex items-center justify-between rounded-2xl border border-white/70 bg-white/80 px-4 py-3"
                      >
                        <p className="pr-4 text-sm font-medium text-ink">{department.dept_name}</p>
                        <span className="rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white">
                          {department.pending_count}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">คลังรอบรายงาน</h2>
                <p className="text-sm leading-6 text-muted">
                  ใช้ย้อนดูรอบรายงานรายสัปดาห์ ตรวจสถานะหลักฐาน และเปิดรายการตรวจรายฝ่ายของแต่ละรอบ
                </p>
              </div>

              <form action={archiveReportBatchesAction} className="mt-4 rounded-2xl border border-brand/15 bg-brand/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink">บันทึกประวัติรอบรายงาน</p>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      เก็บ summary เบา ๆ ไว้ในระบบก่อนล้างข้อมูลรายงานหรือไฟล์หลักฐานขนาดใหญ่
                    </p>
                  </div>
                  <ReportBatchSubmitButton idleLabel="บันทึก Archive" pendingLabel="กำลังบันทึก..." />
                </div>
              </form>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/report"
                  aria-current={data.filters.status === "all" && !data.filters.from && !data.filters.to ? "page" : undefined}
                  className={
                    data.filters.status === "all" && !data.filters.from && !data.filters.to
                      ? "inline-flex min-h-11 items-center rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white"
                      : "inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-brand/35 hover:bg-white hover:text-brand"
                  }
                >
                  ทั้งหมด
                </Link>
                <Link
                  href={buildReportHref({ status: "pending", sort: "progress_asc" })}
                  aria-current={data.filters.status === "pending" ? "page" : undefined}
                  className={
                    data.filters.status === "pending"
                      ? "inline-flex min-h-11 items-center rounded-2xl bg-warning px-4 py-2 text-sm font-semibold text-white"
                      : "inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-warning/40 hover:bg-white hover:text-warning"
                  }
                >
                  ต้องดำเนินการ
                </Link>
                <Link
                  href={buildReportHref({ status: "missing", sort: "progress_asc" })}
                  aria-current={data.filters.status === "missing" ? "page" : undefined}
                  className={data.filters.status === "missing" ? "inline-flex min-h-11 items-center rounded-2xl bg-warning px-4 py-2 text-sm font-semibold text-white" : "inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-warning/40 hover:bg-white hover:text-warning"}
                >
                  ยังไม่ส่ง
                </Link>
                <Link
                  href={buildReportHref({ status: "review", sort: "progress_asc" })}
                  aria-current={data.filters.status === "review" ? "page" : undefined}
                  className={data.filters.status === "review" ? "inline-flex min-h-11 items-center rounded-2xl bg-warning px-4 py-2 text-sm font-semibold text-white" : "inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-warning/40 hover:bg-white hover:text-warning"}
                >
                  รอตรวจ
                </Link>
                <Link
                  href={buildReportHref({ status: "rejected", sort: "progress_asc" })}
                  aria-current={data.filters.status === "rejected" ? "page" : undefined}
                  className={data.filters.status === "rejected" ? "inline-flex min-h-11 items-center rounded-2xl bg-danger px-4 py-2 text-sm font-semibold text-white" : "inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-danger/40 hover:bg-white hover:text-danger"}
                >
                  ตีกลับ
                </Link>
                <Link
                  href={buildReportHref({ status: "complete", sort: "report_date_desc" })}
                  aria-current={data.filters.status === "complete" ? "page" : undefined}
                  className={
                    data.filters.status === "complete"
                      ? "inline-flex min-h-11 items-center rounded-2xl bg-success px-4 py-2 text-sm font-semibold text-white"
                      : "inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-success/40 hover:bg-white hover:text-success"
                  }
                >
                  รายงานครบถ้วน
                </Link>
                <Link
                  href={buildReportHref({ from: currentMonth.start, to: currentMonth.end, sort: data.filters.sort })}
                  className={
                    data.filters.from === currentMonth.start && data.filters.to === currentMonth.end
                      ? "inline-flex min-h-11 items-center rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white"
                      : "inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-brand/35 hover:bg-white hover:text-brand"
                  }
                >
                  เดือนนี้
                </Link>
                <Link
                  href={buildReportHref({ sort: "report_date_desc" })}
                  className="inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-brand/35 hover:bg-white hover:text-brand"
                >
                  รอบล่าสุด
                </Link>
              </div>

              <form className="mt-5 grid gap-3 xl:grid-cols-[1fr_1fr_1.1fr_1.1fr_auto]" action="/report">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-muted">จากวันที่</span>
                  <input
                    type="date"
                    name="from"
                    defaultValue={data.filters.from}
                    className="min-h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-muted">ถึงวันที่</span>
                  <input
                    type="date"
                    name="to"
                    defaultValue={data.filters.to}
                    className="min-h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-muted">สถานะหลักฐาน</span>
                  <select
                    name="status"
                    defaultValue={data.filters.status}
                    className="min-h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
                  >
                    <option value="all">ทั้งหมด</option>
                    <option value="pending">ต้องดำเนินการ</option>
                    <option value="missing">ยังไม่ส่ง</option>
                    <option value="review">รอตรวจ</option>
                    <option value="rejected">ตีกลับให้แก้</option>
                    <option value="complete">อนุมัติครบแล้ว</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-muted">เรียงตาม</span>
                  <select
                    name="sort"
                    defaultValue={data.filters.sort}
                    className="min-h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
                  >
                    <option value="report_date_desc">วันที่รอบใหม่สุด</option>
                    <option value="report_date_asc">วันที่รอบเก่าสุด</option>
                    <option value="created_at_desc">สร้างล่าสุด</option>
                    <option value="item_count_desc">จำนวนเรื่องมากสุด</option>
                    <option value="progress_asc">หลักฐานค้างมากสุด</option>
                  </select>
                </label>
                <button className="min-h-12 self-end rounded-2xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep" type="submit">
                  กรอง
                </button>
              </form>

              <div className="mt-4 flex flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
                <p>พบ {formatNumber(data.batches.length)} รอบรายงานตามเงื่อนไขที่เลือก</p>
                {(data.filters.status !== "all" || data.filters.from || data.filters.to || data.filters.sort !== "report_date_desc") ? (
                  <Link href="/report" className="font-semibold text-brand hover:text-brand-deep">
                    ล้างตัวกรอง
                  </Link>
                ) : null}
              </div>

              <div className="mt-6 space-y-4">
                {data.batches.length === 0 ? (
                  <div className="rounded-2xl bg-surface p-5 text-sm text-muted">ยังไม่มีรอบรายงานในระบบ</div>
                ) : (
                  data.batches.map((batch) => (
                    <article key={batch.id} className="rounded-3xl border border-border bg-surface/55 p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-brand">{formatDate(batch.report_date)}</p>
                            <span
                              className={
                                batch.completionStatus === "complete"
                                  ? "rounded-full border border-success/25 bg-success/10 px-3 py-1 text-xs font-semibold text-success"
                                  : "rounded-full border border-danger/25 bg-danger/10 px-3 py-1 text-xs font-semibold text-danger"
                              }
                            >
                              {batch.completionStatus === "complete" ? "รายงานครบถ้วน" : "ยังไม่ครบถ้วน"}
                            </span>
                          </div>
                          <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">
                            รอบรายงานวันที่ {formatDate(batch.report_date)}
                          </h3>
                          <p className="text-sm text-muted">สร้างเมื่อ {formatDateTime(batch.created_at)}</p>
                          {batch.note ? <p className="text-sm leading-6 text-ink">{batch.note}</p> : null}
                        </div>
                        <Link
                          href={`/report/${batch.id}`}
                          className="rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-brand/35 hover:text-brand hover:shadow-hover"
                        >
                          เปิดรอบรายงาน
                        </Link>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-white p-4">
                          <p className="text-sm text-muted">จำนวนฝ่าย</p>
                          <p className="mt-2 text-2xl font-semibold text-ink">{formatNumber(batch.departmentCount)}</p>
                        </div>
                        <div className="rounded-2xl bg-white p-4">
                          <p className="text-sm text-muted">รายการเรื่องในรอบ</p>
                          <p className="mt-2 text-2xl font-semibold text-ink">{formatNumber(batch.itemCount)}</p>
                        </div>
                        <div className="rounded-2xl bg-white p-4">
                          <p className="text-sm text-muted">การอนุมัติหลักฐาน</p>
                          <p className="mt-2 text-2xl font-semibold text-ink">
                            {formatNumber(batch.evidenceApprovedCount)}/{formatNumber(batch.departmentCount)}
                          </p>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-strong">
                            <div
                              className={batch.evidencePendingCount === 0 ? "h-full bg-success" : "h-full bg-warning"}
                              style={{ width: `${batch.evidenceProgressPercent}%` }}
                            />
                          </div>
                          <p className="mt-2 text-xs text-muted">
                            {batch.evidencePendingCount === 0
                              ? "อนุมัติครบทุกฝ่ายแล้ว"
                              : `ยังไม่อนุมัติ ${formatNumber(batch.evidencePendingCount)} ฝ่าย`}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-warning/10 px-3 py-1 text-warning">ยังไม่ส่ง {formatNumber(batch.evidenceMissingCount)}</span>
                        <span className="rounded-full bg-warning/10 px-3 py-1 text-warning">รอตรวจ {formatNumber(batch.evidencePendingReviewCount)}</span>
                        <span className="rounded-full bg-danger/10 px-3 py-1 text-danger">ตีกลับ {formatNumber(batch.evidenceRejectedCount)}</span>
                        <span className="rounded-full bg-success/10 px-3 py-1 text-success">อนุมัติ {formatNumber(batch.evidenceApprovedCount)}</span>
                      </div>

                      <details className="mt-4 rounded-2xl border border-border bg-white">
                        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink marker:hidden">
                          จัดการรอบนี้
                        </summary>
                        <div className="border-t border-border px-4 py-4">
                          <form action={updateReportBatchAction} className="grid gap-3 lg:grid-cols-[1fr_1.6fr_auto]">
                            <input type="hidden" name="batch_id" value={batch.id} />
                            <label className="space-y-2">
                              <span className="text-xs font-semibold text-muted">วันที่รอบรายงาน</span>
                              <input
                                type="date"
                                name="report_date"
                                defaultValue={batch.report_date}
                                required
                                className="min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
                              />
                            </label>
                            <label className="space-y-2">
                              <span className="text-xs font-semibold text-muted">หมายเหตุ</span>
                              <input
                                type="text"
                                name="note"
                                defaultValue={batch.note || ""}
                                placeholder="เช่น รอบติดตามกลางเดือน"
                                className="min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
                              />
                            </label>
                            <div className="self-end">
                              <ReportBatchSubmitButton idleLabel="บันทึก" pendingLabel="กำลังบันทึก..." />
                            </div>
                          </form>

                          <form action={deleteReportBatchAction} className="mt-4 flex flex-col gap-3 rounded-2xl bg-danger/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <input type="hidden" name="batch_id" value={batch.id} />
                            <p className="text-sm leading-6 text-danger">
                              ลบรอบนี้จะลบรายการฝ่าย รายการเรื่อง และไฟล์หลักฐานที่แนบกับรอบนี้
                            </p>
                            <ReportBatchSubmitButton
                              idleLabel="ลบรอบรายงาน"
                              pendingLabel="กำลังลบ..."
                              variant="danger"
                              confirmMessage={`ยืนยันลบรอบรายงานวันที่ ${formatDate(batch.report_date)} ใช่หรือไม่`}
                            />
                          </form>
                        </div>
                      </details>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>

          <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">ประวัติรอบรายงาน</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Archive summary สำหรับดูย้อนหลังหลังล้าง report batch หรือไฟล์หลักฐานออกจาก Storage แล้ว
                </p>
              </div>
              <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">
                {formatNumber(data.archives.length)} archives
              </span>
            </div>

            <div className="mt-5 space-y-4">
              {data.archives.length === 0 ? (
                <div className="rounded-2xl bg-surface p-5 text-sm leading-6 text-muted">
                  ยังไม่มี archive รอบรายงาน กด “บันทึก Archive” เพื่อเก็บประวัติจากรอบรายงานปัจจุบัน
                </div>
              ) : (
                data.archives.map((archive) => (
                  <article key={archive.id} className="rounded-3xl border border-border bg-surface/55 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-brand">{formatDate(archive.reportDate)}</p>
                          <span
                            className={
                              archive.completionStatus === "complete"
                                ? "rounded-full border border-success/25 bg-success/10 px-3 py-1 text-xs font-semibold text-success"
                                : "rounded-full border border-danger/25 bg-danger/10 px-3 py-1 text-xs font-semibold text-danger"
                            }
                          >
                            {archive.completionStatus === "complete" ? "อนุมัติครบ" : "ยังไม่อนุมัติครบ"}
                          </span>
                          {archive.evidenceSemantics === "legacy_uploaded_v0" ? (
                            <span className="rounded-full border border-warning/25 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                              Archive เดิม—รอยืนยันย้อนหลัง
                            </span>
                          ) : null}
                          {archive.sourceDeleted ? (
                            <span className="rounded-full border border-warning/25 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                              ล้าง source แล้ว
                            </span>
                          ) : null}
                        </div>
                        <h3 className="mt-2 text-lg font-semibold tracking-[-0.01em] text-ink">
                          Archive รอบรายงานวันที่ {formatDate(archive.reportDate)}
                        </h3>
                        <p className="mt-1 text-sm text-muted">
                          เก็บเมื่อ {formatDateTime(archive.archivedAt)} · สร้างรอบเดิมเมื่อ {formatDateTime(archive.reportCreatedAt)}
                        </p>
                        {archive.note ? <p className="mt-2 text-sm leading-6 text-ink">{archive.note}</p> : null}
                      </div>
                      <div className="rounded-2xl bg-white px-4 py-3 text-sm text-muted">
                        <p className="font-semibold text-ink">
                          {archive.evidenceSemantics === "approved_v1"
                            ? `${formatNumber(archive.evidenceApprovedCount)}/${formatNumber(archive.departmentCount)} ฝ่ายอนุมัติแล้ว`
                            : `${formatNumber(archive.evidenceUploadedCount)}/${formatNumber(archive.departmentCount)} ฝ่ายมีไฟล์ตามเกณฑ์เดิม`}
                        </p>
                        <p className="mt-1">รวม {formatNumber(archive.itemCount)} รายการเรื่อง</p>
                      </div>
                    </div>

                    {archive.evidenceSemantics === "approved_v1" ? (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-warning/10 px-3 py-1 text-warning">ยังไม่ส่ง {formatNumber(archive.evidenceMissingCount)}</span>
                        <span className="rounded-full bg-warning/10 px-3 py-1 text-warning">รอตรวจ {formatNumber(archive.evidencePendingReviewCount)}</span>
                        <span className="rounded-full bg-danger/10 px-3 py-1 text-danger">ตีกลับ {formatNumber(archive.evidenceRejectedCount)}</span>
                        <span className="rounded-full bg-success/10 px-3 py-1 text-success">อนุมัติ {formatNumber(archive.evidenceApprovedCount)}</span>
                      </div>
                    ) : null}

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {archive.departments.map((department) => {
                        const badge = getArchiveEvidenceBadge(
                          department.evidenceReviewStatus,
                          department.evidenceUploaded,
                          archive.evidenceSemantics === "legacy_uploaded_v0"
                        );
                        return <div key={`${archive.id}-${department.deptName}`} className="rounded-2xl bg-white px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold leading-6 text-ink">{department.deptName}</p>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-muted">
                            {formatNumber(department.itemCount)} เรื่อง
                            {department.evidenceUploadedAt ? ` · ${formatDateTime(department.evidenceUploadedAt)}` : ""}
                          </p>
                        </div>;
                      })}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
