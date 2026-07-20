import Link from "next/link";

import type { DashboardStatisticsData, DashboardStatisticsReady, TraffyStatusName } from "@/lib/dashboard/statistics";

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

function getStatusTone(name: TraffyStatusName) {
  if (name === "เสร็จสิ้น") return "bg-success/10 text-success";
  if (name === "ส่งต่อ(ใหม่)") return "bg-[rgba(59,130,246,0.09)] text-[#245A9A]";
  if (name === "ไม่เกี่ยวข้อง") return "bg-surface-strong text-muted";
  if (name === "รอรับเรื่อง") return "bg-danger/10 text-danger";
  if (name === "ติดตามเรื่อง") return "bg-warning/10 text-warning";
  return "bg-warning/5 text-ink";
}

function getPresetHref(to: string, days: number) {
  const end = new Date(`${to}T12:00:00+07:00`);
  end.setUTCDate(end.getUTCDate() - (days - 1));
  const from = end.toISOString().slice(0, 10);
  return `/dashboard?from=${from}&to=${to}`;
}

function StatusBoard({ data }: { data: DashboardStatisticsReady }) {
  return (
    <section aria-labelledby="dashboard-status-title" className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="flex flex-col gap-2 border-b border-border px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <h2 id="dashboard-status-title" className="text-xl font-semibold tracking-[-0.01em] text-ink">สถานะเรื่องล่าสุด</h2>
          <p className="mt-1 text-sm leading-6 text-muted">เปอร์เซ็นต์ทุกสถานะใช้เรื่องทั้งหมดในช่วงวันที่เป็นฐานเดียวกัน</p>
        </div>
        <p className="text-xs font-medium text-muted">ผลรวม {formatNumber(data.total)} เรื่อง</p>
      </div>
      <dl className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        {data.statusRows.map((row) => (
          <div key={row.name} className={`min-h-36 p-5 ${getStatusTone(row.name)}`}>
            <dt className="text-sm font-semibold leading-5">{row.name}</dt>
            <dd className="mt-3 tabular-nums">
              <span className="block text-3xl font-semibold tracking-[-0.02em]">{formatNumber(row.count)}</span>
              <span className="mt-1 block text-sm opacity-75">{formatDecimal(row.percent)}%</span>
            </dd>
            {row.name === "เสร็จสิ้น" || row.name === "ไม่เกี่ยวข้อง" ? (
              <p className="mt-3 text-xs leading-5 opacity-75">ข้อมูล “จัดการเอง” ต้องใช้ผู้ปิดเรื่อง ซึ่งไม่มีใน CSV</p>
            ) : null}
          </div>
        ))}
      </dl>
      {data.unknownStateCount > 0 ? (
        <p className="border-t border-border bg-warning/5 px-5 py-3 text-sm text-warning" role="status">
          มี {formatNumber(data.unknownStateCount)} เรื่องที่สถานะว่างหรือยังไม่อยู่ในชุดสถานะมาตรฐาน และรวมอยู่ในยอดทั้งหมดแล้ว
        </p>
      ) : null}
    </section>
  );
}

function StatisticsContent({ data }: { data: DashboardStatisticsReady }) {
  const finishPercent = data.total > 0 ? (data.rollup.finish / data.total) * 100 : 0;
  const maxProblemType = data.problemTypes[0]?.count || 1;
  const reportHref = `/api/report/summary-pdf?from=${encodeURIComponent(data.range.from)}&to=${encodeURIComponent(data.range.to)}`;

  return (
    <div className="space-y-6">
      <section aria-labelledby="dashboard-summary-title" className="rounded-2xl bg-brand-deep p-5 text-white sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_2fr] xl:items-center">
          <div>
            <p className="text-sm font-medium text-white/75">เรื่องแจ้งทั้งหมดในช่วง</p>
            <h2 id="dashboard-summary-title" className="mt-2 text-4xl font-semibold tracking-[-0.03em] tabular-nums sm:text-5xl">
              {formatNumber(data.total)}
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/75">รับแจ้ง {formatThaiDate(data.range.from)} – {formatThaiDate(data.range.to)}</p>
          </div>
          <dl className="grid gap-px overflow-hidden rounded-xl bg-white/20 sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-brand-deep p-4">
              <dt className="text-xs text-white/70">พ้นรอรับเรื่อง</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums">{formatNumber(data.managed)}</dd>
            </div>
            <div className="bg-brand-deep p-4">
              <dt className="text-xs text-white/70">เสร็จสิ้น</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums">{formatNumber(data.rollup.finish)}</dd>
              <p className="mt-1 text-xs text-white/65">{formatDecimal(finishPercent)}% ของทั้งหมด</p>
            </div>
            <div className="bg-brand-deep p-4">
              <dt className="text-xs text-white/70">เสร็จสิ้นที่ได้ 1–2 ดาว</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums">{formatNumber(data.finishedLowRating.count)}</dd>
              <p className="mt-1 text-xs text-white/65">{formatDecimal(data.finishedLowRating.percentOfFinished)}% ของเสร็จสิ้น</p>
            </div>
            <div className="bg-brand-deep p-4">
              <dt className="text-xs text-white/70">คะแนนเฉลี่ย</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums">{data.feedback.average === null ? "–" : `${formatDecimal(data.feedback.average)}/5`}</dd>
              <p className="mt-1 text-xs text-white/65">จาก {formatNumber(data.feedback.count)} คะแนน</p>
            </div>
          </dl>
        </div>
      </section>

      <StatusBoard data={data} />

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-border bg-white p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">ประเภทปัญหาที่พบมาก</h2>
              <p className="mt-1 text-sm leading-6 text-muted">เรียงจากจำนวนเรื่องที่รับแจ้งในช่วงวันที่ที่เลือก</p>
            </div>
            <Link href="/analytics" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:text-brand-deep focus:outline-none focus:ring-4 focus:ring-[var(--ring)]">ดูการวิเคราะห์</Link>
          </div>
          <ol className="mt-5 space-y-4">
            {data.problemTypes.length === 0 ? <li className="text-sm text-muted">ไม่พบข้อมูลประเภทปัญหาในช่วงนี้</li> : data.problemTypes.map((row) => (
              <li key={row.name}>
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="font-medium text-ink">{row.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">{formatNumber(row.count)} · {formatDecimal(row.percent)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-strong" aria-hidden="true">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, (row.count / maxProblemType) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </div>

        <aside className="rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="dashboard-method-title">
          <h2 id="dashboard-method-title" className="text-xl font-semibold tracking-[-0.01em] text-ink">ขอบเขตและความน่าเชื่อถือ</h2>
          <div className="mt-4 space-y-4 text-sm leading-6 text-muted">
            <p><strong className="text-ink">สถานะ:</strong> ใช้สถานะล่าสุดของเรื่องที่รับแจ้งในช่วง ไม่ใช่สถานะย้อนหลัง ณ วันสิ้นสุด</p>
            <p><strong className="text-ink">เสร็จสิ้นที่ได้ 1–2 ดาว:</strong> เป็น feedback คะแนนต่ำในเรื่องที่มีสถานะเสร็จสิ้น ตัวเลข 808 ตรงกับ snapshot อ้างอิง แต่ไม่ใช่ข้อมูลยืนยันหรือรับรองการแก้ไข</p>
            <p><strong className="text-ink">เวลาที่ใช้แก้ไข:</strong> ยังไม่แสดง เพราะ `last_activity` ไม่ใช่เวลาปิดเรื่องที่ยืนยันได้</p>
            <p><strong className="text-ink">จัดการเอง:</strong> ยังไม่แสดงเป็นศูนย์ เพราะข้อมูลผู้ดำเนินการปิดเรื่องไม่มีอยู่ในไฟล์ต้นทาง</p>
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <a href={reportHref} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-deep focus:outline-none focus:ring-4 focus:ring-[var(--ring)]">
              ดาวน์โหลดรายงานช่วงนี้
            </a>
            <Link href="/docs/dashboard-calculation" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-brand/40 focus:outline-none focus:ring-4 focus:ring-[var(--ring)]">
              ดูเอกสารสูตรคำนวณ
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}

export function TraffyStatistics({ data }: { data: DashboardStatisticsData }) {
  const range = data.range;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="dashboard-range-title">
        <form method="get" className="grid gap-4 xl:grid-cols-[auto_1fr_1fr_auto] xl:items-end">
          <fieldset className="min-w-0">
            <legend id="dashboard-range-title" className="text-sm font-semibold text-ink">ช่วงวันที่รับแจ้ง</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[30, 90, 180].map((days) => <Link key={days} href={getPresetHref(range.to, days)} className="inline-flex min-h-11 items-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-muted hover:border-brand/40 hover:text-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]">{days} วัน</Link>)}
              <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-full border border-border bg-white px-4 text-sm font-semibold text-muted hover:border-brand/40 hover:text-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]">ทั้งหมด</Link>
            </div>
          </fieldset>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-ink">ตั้งแต่วันที่</span>
            <input type="date" name="from" defaultValue={range.from} required className="min-h-12 w-full rounded-xl border border-border bg-white px-4 text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-ink">ถึงวันที่</span>
            <input type="date" name="to" defaultValue={range.to} required className="min-h-12 w-full rounded-xl border border-border bg-white px-4 text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]" />
          </label>
          <button type="submit" className="min-h-12 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-deep focus:outline-none focus:ring-4 focus:ring-[var(--ring)]">แสดงผล</button>
        </form>
      </section>

      {data.status === "ready" ? <StatisticsContent data={data} /> : (
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
