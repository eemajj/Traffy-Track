import Link from "next/link";

import { archiveReportBatchesAction, deleteReportBatchAction, updateReportBatchAction } from "@/app/report/actions";
import { ReportBatchSubmitButton } from "@/app/report/report-batch-submit-button";
import type { ReportPageData } from "@/lib/report/types";
import { buildReportHref, formatReportDate as formatDate, formatReportDateTime as formatDateTime, formatReportNumber as formatNumber } from "@/lib/report/page-model";

type ReadyReportData = Extract<ReportPageData, { status: "ready" }>;

const statusLinks = [
  { status: "pending", label: "ต้องดำเนินการ", tone: "warning" },
  { status: "missing", label: "ยังไม่ส่ง", tone: "warning" },
  { status: "review", label: "รอตรวจ", tone: "warning" },
  { status: "rejected", label: "ตีกลับ", tone: "danger" },
  { status: "complete", label: "รายงานครบถ้วน", tone: "success" }
] as const;

export function ReportBatchList({ data, currentMonth }: { data: ReadyReportData; currentMonth: { start: string; end: string } }) {
  return (
    <section className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
      <div className="space-y-2"><h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">คลังรอบรายงาน</h2><p className="text-sm leading-6 text-muted">ใช้ย้อนดูรอบรายงานรายสัปดาห์ ตรวจสถานะหลักฐาน และเปิดรายการตรวจรายฝ่ายของแต่ละรอบ</p></div>
      <form action={archiveReportBatchesAction} className="mt-4 rounded-2xl border border-brand/15 bg-brand/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-ink">บันทึกประวัติรอบรายงาน</p><p className="mt-1 text-sm leading-6 text-muted">เก็บ summary เบา ๆ ไว้ในระบบก่อนล้างข้อมูลรายงานหรือไฟล์หลักฐานขนาดใหญ่</p></div><ReportBatchSubmitButton idleLabel="บันทึก Archive" pendingLabel="กำลังบันทึก..." /></div>
      </form>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/report" aria-current={data.filters.status === "all" && !data.filters.from && !data.filters.to ? "page" : undefined} className={filterLinkClass(data.filters.status === "all" && !data.filters.from && !data.filters.to, "brand")}>ทั้งหมด</Link>
        {statusLinks.map((item) => <Link key={item.status} href={buildReportHref({ status: item.status, sort: item.status === "complete" ? "report_date_desc" : "progress_asc" })} aria-current={data.filters.status === item.status ? "page" : undefined} className={filterLinkClass(data.filters.status === item.status, item.tone)}>{item.label}</Link>)}
        <Link href={buildReportHref({ from: currentMonth.start, to: currentMonth.end, sort: data.filters.sort })} className={filterLinkClass(data.filters.from === currentMonth.start && data.filters.to === currentMonth.end, "brand")}>เดือนนี้</Link>
        <Link href={buildReportHref({ sort: "report_date_desc" })} className={filterLinkClass(false, "brand")}>รอบล่าสุด</Link>
      </div>

      <form className="mt-5 grid gap-3 xl:grid-cols-[1fr_1fr_1.1fr_1.1fr_auto]" action="/report">
        <FilterDate label="จากวันที่" name="from" value={data.filters.from} />
        <FilterDate label="ถึงวันที่" name="to" value={data.filters.to} />
        <label className="space-y-2"><span className="text-xs font-semibold text-muted">สถานะหลักฐาน</span><select name="status" defaultValue={data.filters.status} className={inputClass}><option value="all">ทั้งหมด</option><option value="pending">ต้องดำเนินการ</option><option value="missing">ยังไม่ส่ง</option><option value="review">รอตรวจ</option><option value="rejected">ตีกลับให้แก้</option><option value="complete">อนุมัติครบแล้ว</option></select></label>
        <label className="space-y-2"><span className="text-xs font-semibold text-muted">เรียงตาม</span><select name="sort" defaultValue={data.filters.sort} className={inputClass}><option value="report_date_desc">วันที่รอบใหม่สุด</option><option value="report_date_asc">วันที่รอบเก่าสุด</option><option value="created_at_desc">สร้างล่าสุด</option><option value="item_count_desc">จำนวนเรื่องมากสุด</option><option value="progress_asc">หลักฐานค้างมากสุด</option></select></label>
        <button className="min-h-12 self-end rounded-2xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep" type="submit">กรอง</button>
      </form>

      <div className="mt-4 flex flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between"><p>พบ {formatNumber(data.batches.length)} รอบรายงานตามเงื่อนไขที่เลือก</p>{hasActiveFilters(data) ? <Link href="/report" className="font-semibold text-brand hover:text-brand-deep">ล้างตัวกรอง</Link> : null}</div>
      <div className="mt-6 space-y-4">{data.batches.length === 0 ? <div className="rounded-2xl bg-surface p-5 text-sm text-muted">ยังไม่มีรอบรายงานในระบบ</div> : data.batches.map((batch) => <ReportBatchCard key={batch.id} batch={batch} />)}</div>
    </section>
  );
}

function getLifecycleBadge(status: ReadyReportData["batches"][number]["lifecycleStatus"]) {
  switch (status) {
    case "draft":
      return <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">ร่างรอบรายงาน</span>;
    case "sent":
      return <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800">ส่งติดตามแล้ว</span>;
    case "partially_returned":
      return <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">ส่งกลับบางส่วน</span>;
    case "complete":
      return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">รายงานครบถ้วน</span>;
    case "locked":
      return <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-800">🔒 ปิดรอบถาวร</span>;
    default:
      return null;
  }
}

function ReportBatchCard({ batch }: { batch: ReadyReportData["batches"][number] }) {
  return (
    <article className="rounded-2xl border border-border bg-surface/55 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-brand">{formatDate(batch.report_date)}</p>
            {getLifecycleBadge(batch.lifecycleStatus)}
            <span className={batch.completionStatus === "complete" ? "rounded-full border border-success/25 bg-success/10 px-3 py-1 text-xs font-semibold text-success" : "rounded-full border border-danger/25 bg-danger/10 px-3 py-1 text-xs font-semibold text-danger"}>
              {batch.completionStatus === "complete" ? "หลักฐานครบถ้วน" : "หลักฐานยังไม่ครบ"}
            </span>
          </div>
          <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">รอบรายงานวันที่ {formatDate(batch.report_date)}</h3>
          <p className="text-sm text-muted">สร้างเมื่อ {formatDateTime(batch.created_at)}</p>
          {batch.note ? <p className="text-sm leading-6 text-ink">{batch.note}</p> : null}
        </div>
        <Link href={`/report/${batch.id}`} className="rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-brand/35 hover:text-brand hover:shadow-hover">เปิดรอบรายงาน</Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><BatchMetric label="จำนวนฝ่าย" value={formatNumber(batch.departmentCount)} /><BatchMetric label="รายการเรื่องในรอบ" value={formatNumber(batch.itemCount)} /><div className="rounded-2xl bg-white p-4"><p className="text-sm text-muted">การอนุมัติหลักฐาน</p><p className="mt-2 text-2xl font-semibold text-ink">{formatNumber(batch.evidenceApprovedCount)}/{formatNumber(batch.departmentCount)}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-strong"><div className={batch.evidencePendingCount === 0 ? "h-full bg-success" : "h-full bg-warning"} style={{ width: `${batch.evidenceProgressPercent}%` }} /></div><p className="mt-2 text-xs text-muted">{batch.evidencePendingCount === 0 ? "อนุมัติครบทุกฝ่ายแล้ว" : `ยังไม่อนุมัติ ${formatNumber(batch.evidencePendingCount)} ฝ่าย`}</p></div></div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-warning/10 px-3 py-1 text-warning">ยังไม่ส่ง {formatNumber(batch.evidenceMissingCount)}</span><span className="rounded-full bg-warning/10 px-3 py-1 text-warning">รอตรวจ {formatNumber(batch.evidencePendingReviewCount)}</span><span className="rounded-full bg-danger/10 px-3 py-1 text-danger">ตีกลับ {formatNumber(batch.evidenceRejectedCount)}</span><span className="rounded-full bg-success/10 px-3 py-1 text-success">อนุมัติ {formatNumber(batch.evidenceApprovedCount)}</span></div>
      <details className="mt-4 rounded-2xl border border-border bg-white"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink marker:hidden">จัดการรอบนี้</summary><div className="border-t border-border px-4 py-4"><form action={updateReportBatchAction} className="grid gap-3 lg:grid-cols-[1fr_1.6fr_auto]"><input type="hidden" name="batch_id" value={batch.id} /><FilterDate label="วันที่รอบรายงาน" name="report_date" value={batch.report_date} required /><label className="space-y-2"><span className="text-xs font-semibold text-muted">หมายเหตุ</span><input type="text" name="note" defaultValue={batch.note || ""} placeholder="เช่น รอบติดตามกลางเดือน" className={inputClass} /></label><div className="self-end"><ReportBatchSubmitButton idleLabel="บันทึก" pendingLabel="กำลังบันทึก..." /></div></form><form action={deleteReportBatchAction} className="mt-4 flex flex-col gap-3 rounded-2xl bg-danger/5 p-4 sm:flex-row sm:items-center sm:justify-between"><input type="hidden" name="batch_id" value={batch.id} /><p className="text-sm leading-6 text-danger">ลบรอบนี้จะลบรายการฝ่าย รายการเรื่อง และไฟล์หลักฐานที่แนบกับรอบนี้</p><ReportBatchSubmitButton idleLabel="ลบรอบรายงาน" pendingLabel="กำลังลบ..." variant="danger" confirmMessage={`ยืนยันลบรอบรายงานวันที่ ${formatDate(batch.report_date)} ใช่หรือไม่`} /></form></div></details>
    </article>
  );
}

const inputClass = "min-h-12 w-full rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]";
function FilterDate({ label, name, value, required = false }: { label: string; name: string; value: string; required?: boolean }) { return <label className="space-y-2"><span className="text-xs font-semibold text-muted">{label}</span><input type="date" name={name} defaultValue={value} required={required} className={inputClass} /></label>; }
function BatchMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-white p-4"><p className="text-sm text-muted">{label}</p><p className="mt-2 text-2xl font-semibold text-ink">{value}</p></div>; }
function hasActiveFilters(data: ReadyReportData) { return data.filters.status !== "all" || Boolean(data.filters.from) || Boolean(data.filters.to) || data.filters.sort !== "report_date_desc"; }
function filterLinkClass(active: boolean, tone: "brand" | "warning" | "danger" | "success") { const activeClass = { brand: "bg-brand", warning: "bg-warning", danger: "bg-danger", success: "bg-success" }[tone]; const hoverClass = { brand: "hover:border-brand/35 hover:text-brand", warning: "hover:border-warning/40 hover:text-warning", danger: "hover:border-danger/40 hover:text-danger", success: "hover:border-success/40 hover:text-success" }[tone]; return active ? `inline-flex min-h-11 items-center rounded-2xl px-4 py-2 text-sm font-semibold text-white ${activeClass}` : `inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-white ${hoverClass}`; }
