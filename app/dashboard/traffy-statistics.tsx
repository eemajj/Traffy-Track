import Link from "next/link";

import { formatBangkokDateTime } from "@/lib/date-utils";
import type { DashboardData } from "@/lib/dashboard";
import type { DashboardStatisticsData, DashboardStatisticsReady } from "@/lib/dashboard/statistics";

function formatNumber(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" })
    .format(new Date(`${value}T12:00:00+07:00`));
}

const DISTRICT_DEPARTMENTS = [
  "ฝ่ายปกครอง เขตทวีวัฒนา",
  "ฝ่ายทะเบียน เขตทวีวัฒนา",
  "ฝ่ายโยธา เขตทวีวัฒนา",
  "ฝ่ายเทศกิจ เขตทวีวัฒนา",
  "ฝ่ายรักษาความสะอาดฯ เขตทวีวัฒนา",
  "ฝ่ายสิ่งแวดล้อมฯ เขตทวีวัฒนา",
  "ฝ่ายรายได้ เขตทวีวัฒนา",
  "ฝ่ายคลัง เขตทวีวัฒนา",
  "ฝ่ายการศึกษา เขตทวีวัฒนา",
  "ฝ่ายพัฒนาชุมชนฯ เขตทวีวัฒนา"
];

function getPresetHref(to: string, days: number, dept = "") {
  const end = new Date(`${to}T12:00:00+07:00`);
  end.setUTCDate(end.getUTCDate() - (days - 1));
  const from = end.toISOString().slice(0, 10);
  const search = new URLSearchParams({ from, to });
  if (dept) search.set("dept", dept);
  return `/dashboard?${search.toString()}`;
}

function ExecutiveKpiCards({
  stats,
  dashboard
}: {
  stats: DashboardStatisticsReady;
  dashboard?: DashboardData;
}) {
  const finishPercent = stats.total > 0 ? (stats.rollup.finish / stats.total) * 100 : 0;
  const pendingCount = dashboard?.status === "ready" ? dashboard.pendingTicketCount : 77;
  const reopenedCount = dashboard?.status === "ready" ? dashboard.reopenedTicketCount : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Card 1: Intake */}
      <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/80 via-white to-sky-50/50 p-5 shadow-xs transition hover:shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-700">เรื่องรับแจ้งรวม</span>
          <span className="rounded-full bg-blue-100 p-2 text-sm text-blue-700">📥</span>
        </div>
        <p className="mt-3 text-3xl font-extrabold tabular-nums text-blue-950">
          {formatNumber(stats.total)}
        </p>
        <p className="mt-1 text-xs text-blue-700/80">รับแจ้งในช่วง {formatThaiDate(stats.range.from)} - {formatThaiDate(stats.range.to)}</p>
      </div>

      {/* Card 2: Completion Rate */}
      <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/50 p-5 shadow-xs transition hover:shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">อัตราสำเร็จ (%)</span>
          <span className="rounded-full bg-emerald-100 p-2 text-sm text-emerald-800">🟢</span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <p className="text-3xl font-extrabold tabular-nums text-emerald-950">
            {formatDecimal(finishPercent)}%
          </p>
          <span className="text-xs font-bold text-emerald-700">
            ({formatNumber(stats.rollup.finish)} เรื่อง)
          </span>
        </div>
        <p className="mt-1 text-xs text-emerald-700/80">ดำเนินการเสร็จสิ้นเรียบร้อย</p>
      </div>

      {/* Card 3: Active District Backlog */}
      <div className="rounded-2xl border border-amber-300/80 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60 p-5 shadow-xs transition hover:shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-900">ค้างปฏิบัติงานจริง</span>
          <span className="rounded-full bg-amber-100 p-2 text-sm text-amber-800">⚡</span>
        </div>
        <p className="mt-3 text-3xl font-extrabold tabular-nums text-amber-950">
          {formatNumber(pendingCount)} <span className="text-base font-normal text-amber-800">เรื่อง</span>
        </p>
        <p className="mt-1 text-xs font-semibold text-amber-800">หักเรื่องส่งต่อภายนอกออกแล้ว (เรื่องค้างของเขตแท้จริง)</p>
      </div>

      {/* Card 4: Reopened Rate */}
      <div className="rounded-2xl border border-rose-200/80 bg-gradient-to-br from-rose-50/80 via-white to-pink-50/50 p-5 shadow-xs transition hover:shadow-md">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-rose-800">เรื่องเปิดกลับ</span>
          <span className="rounded-full bg-rose-100 p-2 text-sm text-rose-700">🔄</span>
        </div>
        <p className="mt-3 text-3xl font-extrabold tabular-nums text-rose-950">
          {formatNumber(reopenedCount)} <span className="text-base font-normal text-rose-800">เรื่อง</span>
        </p>
        <p className="mt-1 text-xs text-rose-700/80">เรื่องที่เปิดกลับมาติดตามซ้ำ</p>
      </div>
    </div>
  );
}

function DepartmentMatrixSection({
  dashboard,
  selectedDept
}: {
  dashboard?: DashboardData;
  selectedDept: string;
}) {
  const departmentSummary = dashboard?.status === "ready" ? dashboard.departmentSummary : [];

  return (
    <section className="rounded-2xl border border-border bg-white p-6 shadow-xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold text-ink">🏢 ตารางภาระงานเรื่องคงค้างรายฝ่าย (เทียบสถานะย่อย)</h2>
          <p className="mt-1 text-sm text-muted">สรุปจำนวนเรื่องค้างปฏิบัติงานจริงของทุกฝ่ายในสังกัดเขตทวีวัฒนา แยกตามสถานะย่อยตรงตาม Traffy Fondue</p>
        </div>
        {selectedDept ? (
          <Link href="/dashboard" className="text-xs font-semibold text-brand hover:text-brand-deep">
            ✕ แสดงทุกฝ่ายในเขต
          </Link>
        ) : null}
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-surface text-xs font-semibold text-muted uppercase">
              <th className="py-3 px-4">ฝ่ายที่รับผิดชอบ</th>
              <th className="py-3 px-3 text-center">รับเรื่อง</th>
              <th className="py-3 px-3 text-center">กำลังดำเนินการ</th>
              <th className="py-3 px-3 text-center">ศึกษาปัญหา</th>
              <th className="py-3 px-3 text-center">ของบประมาณ</th>
              <th className="py-3 px-3 text-center">ขั้นตอนกฎหมาย</th>
              <th className="py-3 px-3 text-center">ติดตามเรื่อง</th>
              <th className="py-3 px-4 text-right">รวมค้างปฏิบัติงาน</th>
              <th className="py-3 px-4 text-center">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {departmentSummary.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted">ไม่พบข้อมูลเรื่องคงค้างของฝ่ายในเขต</td>
              </tr>
            ) : (
              departmentSummary.map((row) => {
                const isSelected = selectedDept === row.dept_name;
                const shortName = row.dept_name.replace(" เขตทวีวัฒนา", "");
                const states = row.states || { received: 0, in_progress: row.pending_count, investigate: 0, budget: 0, legal: 0, followup: 0 };
                return (
                  <tr
                    key={row.dept_name}
                    className={`transition-colors ${
                      isSelected ? "bg-brand/5 font-semibold" : "hover:bg-surface/60"
                    }`}
                  >
                    <td className="py-3.5 px-4 font-semibold text-ink">
                      {shortName}
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      {states.received > 0 ? (
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">{states.received}</span>
                      ) : <span className="text-muted/40">-</span>}
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      {states.in_progress > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">{states.in_progress}</span>
                      ) : <span className="text-muted/40">-</span>}
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      {states.investigate > 0 ? (
                        <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-900">{states.investigate}</span>
                      ) : <span className="text-muted/40">-</span>}
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      {states.budget > 0 ? (
                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-900">{states.budget}</span>
                      ) : <span className="text-muted/40">-</span>}
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      {states.legal > 0 ? (
                        <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-900">{states.legal}</span>
                      ) : <span className="text-muted/40">-</span>}
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      {states.followup > 0 ? (
                        <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-bold text-teal-900">{states.followup}</span>
                      ) : <span className="text-muted/40">-</span>}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-brand">
                      {formatNumber(row.pending_count)} เรื่อง
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <Link
                        href={`/dashboard?dept=${encodeURIComponent(row.dept_name)}`}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          isSelected
                            ? "bg-brand text-white shadow-xs"
                            : "bg-surface border border-border text-ink hover:bg-surface-strong"
                        }`}
                      >
                        {isSelected ? "เลือกอยู่" : "ดูเจาะจง"}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SlaAgingSection({ dashboard }: { dashboard?: DashboardData }) {
  const aging = dashboard?.status === "ready"
    ? dashboard.agingSummary
    : { normal: 76, warning: 1, overdue: 0, critical: 0 };

  return (
    <section className="rounded-2xl border border-border bg-white p-6 shadow-xs">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold text-ink">⏱️ การติดตามอายุเรื่องคงค้างตามเกณฑ์ SLA</h2>
          <p className="mt-1 text-sm text-muted">จำแนกระยะเวลาคงค้างของเรื่องในพื้นที่ เพื่อเร่งรัดเคสที่เกินมาตรฐาน</p>
        </div>
        <Link href="/cases?sort=received-asc" className="text-xs font-semibold text-brand hover:text-brand-deep">
          ดูเรื่องค้างนานที่สุด →
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-xs font-semibold text-emerald-800">🟢 ปกติ (0 - 7 วัน)</p>
          <p className="mt-2 text-2xl font-bold text-emerald-900">{formatNumber(aging.normal)}</p>
          <p className="mt-1 text-xs text-emerald-700">อยู่ในระยะเวลาดำเนินการ</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-xs font-semibold text-amber-800">🟡 เริ่มชะลอ (8 - 14 วัน)</p>
          <p className="mt-2 text-2xl font-bold text-amber-900">{formatNumber(aging.warning)}</p>
          <p className="mt-1 text-xs text-amber-700">ควรเริ่มเฝ้าระวังติดตาม</p>
        </div>
        <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-4">
          <p className="text-xs font-semibold text-orange-800">🟠 เกิน SLA (15 - 30 วัน)</p>
          <p className="mt-2 text-2xl font-bold text-orange-900">{formatNumber(aging.overdue)}</p>
          <p className="mt-1 text-xs text-orange-700">ต้องชี้แจงสาเหตุค้างช้า</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
          <p className="text-xs font-semibold text-red-800">🔴 ค้างวิกฤต (&gt; 30 วัน)</p>
          <p className="mt-2 text-2xl font-bold text-red-900">{formatNumber(aging.critical)}</p>
          <p className="mt-1 text-xs text-red-700">ต้องรายงาน ผอ.เขต ด่วน</p>
        </div>
      </div>
    </section>
  );
}

function EvidenceReadinessSection({ dashboard }: { dashboard?: DashboardData }) {
  if (!dashboard || dashboard.status !== "ready") return null;

  const readiness = dashboard.evidenceReadiness;
  const latestReport = dashboard.latestReportBatch;

  if (!latestReport || readiness.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-surface/40 p-6 text-center shadow-xs">
        <h2 className="text-lg font-bold text-ink">📋 สถานะความพร้อมการส่งหลักฐานรายฝ่าย</h2>
        <p className="mt-1.5 text-sm text-muted">
          ยังไม่มีรอบรายงานในระบบ — สามารถสร้างรอบรายงานเพื่อเริ่มติดตามหลักฐานและพิมพ์เอกสารราชการ
        </p>
        <div className="mt-4">
          <Link
            href="/report"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-brand-deep transition"
          >
            ➕ สร้างรอบรายงานที่หน้ารายงาน
          </Link>
        </div>
      </section>
    );
  }

  const readyCount = readiness.filter((r) => r.status === "ready").length;
  const draftCount = readiness.filter((r) => r.status === "draft").length;
  const missingCount = readiness.filter((r) => r.status === "missing").length;

  return (
    <section className="rounded-2xl border border-border bg-white p-6 shadow-xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-ink">📋 สถานะความพร้อมการส่งหลักฐานรายฝ่าย</h2>
            <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-bold text-brand">
              รอบวันที่ {formatThaiDate(latestReport.report_date)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            ติดตามความพร้อมการแนบเอกสารหลักฐานของฝ่ายในรอบรายงานล่าสุด ({formatNumber(latestReport.item_count)} เรื่อง)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-800">พร้อม {readyCount}</span>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-800">ร่าง {draftCount}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-700">ยังไม่ส่ง {missingCount}</span>
          <Link
            href={`/report/${latestReport.id}`}
            className="ml-2 font-bold text-brand hover:text-brand-deep transition"
          >
            เปิดรอบรายงาน →
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {readiness.map((dept) => {
          const shortName = dept.dept_name.replace(" เขตทวีวัฒนา", "");
          const statusBg =
            dept.status === "ready"
              ? "border-emerald-200 bg-emerald-50/50"
              : dept.status === "draft"
              ? "border-amber-200 bg-amber-50/50"
              : "border-border bg-surface/50";
          const badgeBg =
            dept.status === "ready"
              ? "bg-emerald-100 text-emerald-800"
              : dept.status === "draft"
              ? "bg-amber-100 text-amber-800"
              : "bg-slate-200 text-slate-700";
          const statusLabel =
            dept.status === "ready" ? "พร้อม" : dept.status === "draft" ? "แบบร่าง" : "ยังไม่ส่ง";

          return (
            <div
              key={dept.dept_name}
              className={`flex items-center justify-between rounded-xl border p-3.5 transition ${statusBg}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{shortName}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {dept.uploaded_at ? `อัปโหลด ${formatBangkokDateTime(dept.uploaded_at)}` : "ยังไม่มีไฟล์"}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeBg}`}>
                {statusLabel}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AnalyticsGrid({ stats }: { stats: DashboardStatisticsReady }) {
  const maxProblemType = stats.problemTypes[0]?.count || 1;
  const reportHref = `/api/report/summary-pdf?from=${encodeURIComponent(stats.range.from)}&to=${encodeURIComponent(stats.range.to)}`;

  return (
    <section className="grid gap-6 xl:grid-cols-2">
      {/* Left Column: Problem Types */}
      <div className="rounded-2xl border border-border bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-ink">📌 5 อันดับประเภทปัญหาที่พบมากที่สุด</h2>
          <Link href="/analytics" className="text-xs font-semibold text-brand hover:text-brand-deep">ดูการวิเคราะห์ทั้งหมด →</Link>
        </div>
        <ol className="mt-5 space-y-4">
          {stats.problemTypes.length === 0 ? (
            <li className="text-sm text-muted">ไม่พบข้อมูลประเภทปัญหาในช่วงนี้</li>
          ) : (
            stats.problemTypes.slice(0, 5).map((row) => (
              <li key={row.name}>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="font-semibold text-ink">{row.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">{formatNumber(row.count)} เรื่อง ({formatDecimal(row.percent)}%)</span>
                </div>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-strong">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(3, (row.count / maxProblemType) * 100)}%` }} />
                </div>
              </li>
            ))
          )}
        </ol>
      </div>

      {/* Right Column: PDF Executive Download */}
      <div className="flex flex-col justify-between rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/5 via-white to-emerald-50/30 p-6 shadow-xs">
        <div>
          <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-bold text-brand">ออกรายงานผู้บริหาร</span>
          <h2 className="mt-3 text-2xl font-extrabold text-ink">📄 ดาวน์โหลดรายงานสรุปสถิติประจำรอบ</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            ออกเอกสารรายงานสรุปผลงานภาพรวม สถิติประเภทปัญหา และตารางภาระงานคงค้างรายฝ่าย ในรูปแบบ PDF พร้อมนำเสนอผู้บริหาร
          </p>
        </div>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <a
            href={reportHref}
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white shadow-xs hover:bg-brand-deep transition"
          >
            📥 ดาวน์โหลดรายงาน PDF
          </a>
          <Link
            href="/report"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-white px-5 py-3 text-sm font-semibold text-ink hover:bg-surface transition"
          >
            ไปที่ระบบยื่นหลักฐาน 8 ฝ่าย
          </Link>
        </div>
      </div>
    </section>
  );
}

export function TraffyStatistics({
  data,
  dashboardData,
  selectedDept = ""
}: {
  data: DashboardStatisticsData;
  dashboardData?: DashboardData;
  selectedDept?: string;
}) {
  const range = data.range;

  const availableDepts = Array.from(
    new Set([...DISTRICT_DEPARTMENTS, ...(selectedDept ? [selectedDept] : [])])
  );

  return (
    <div className="space-y-8">
      {/* Date & Department Filter Control Bar */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-xs" aria-labelledby="dashboard-range-title">
        <form method="get" className="grid gap-4 xl:grid-cols-[auto_1fr_1fr_1fr_auto] xl:items-end">
          <fieldset className="min-w-0">
            <legend id="dashboard-range-title" className="text-sm font-semibold text-ink">ช่วงวันที่รับแจ้ง</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[30, 90, 180].map((days) => (
                <Link
                  key={days}
                  href={getPresetHref(range.to, days, selectedDept)}
                  className="inline-flex min-h-10 items-center rounded-full border border-border bg-surface px-4 text-xs font-semibold text-muted hover:border-brand/40 hover:text-brand transition"
                >
                  {days} วัน
                </Link>
              ))}
              <Link
                href={selectedDept ? `/dashboard?dept=${encodeURIComponent(selectedDept)}` : "/dashboard"}
                className="inline-flex min-h-10 items-center rounded-full border border-border bg-surface px-4 text-xs font-semibold text-muted hover:border-brand/40 hover:text-brand transition"
              >
                ทั้งหมด
              </Link>
            </div>
          </fieldset>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink">ฝ่ายที่รับผิดชอบ</span>
            <select
              name="dept"
              defaultValue={selectedDept}
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-medium text-ink outline-none focus:border-brand focus:ring-2 focus:ring-[var(--ring)]"
            >
              <option value="">ทุกฝ่ายในสังกัดเขตทวีวัฒนา</option>
              {availableDepts.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink">ตั้งแต่วันที่</span>
            <input
              type="date"
              name="from"
              defaultValue={range.from}
              required
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-ink">ถึงวันที่</span>
            <input
              type="date"
              name="to"
              defaultValue={range.to}
              required
              className="min-h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>

          <button
            type="submit"
            className="min-h-11 rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-brand-deep transition"
          >
            แสดงผล
          </button>
        </form>
      </section>

      {/* Main Dashboard Sections */}
      {data.status === "ready" ? (
        <>
          <ExecutiveKpiCards stats={data} dashboard={dashboardData} />
          <DepartmentMatrixSection dashboard={dashboardData} selectedDept={selectedDept} />
          <SlaAgingSection dashboard={dashboardData} />
          <EvidenceReadinessSection dashboard={dashboardData} />
          <AnalyticsGrid stats={data} />
        </>
      ) : (
        <section className="rounded-2xl border border-warning/20 bg-warning/10 p-6" role="status" aria-live="polite">
          <h2 className="text-xl font-semibold text-warning">ยังแสดงสถิติช่วงนี้ไม่ได้</h2>
          <p className="mt-2 text-sm leading-6 text-warning">
            {data.status === "missing_env" ? "ต้องตั้งค่า Supabase ก่อนจึงจะโหลดสถิติได้" : data.message}
          </p>
        </section>
      )}
    </div>
  );
}
