import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import {
  ANALYTICS_PERIODS,
  AnalyticsReadyData,
  AnalyticsTrendPoint,
  getAnalyticsData,
  getAnalyticsPeriodDays,
  PendingAgeBucket
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

type AnalyticsPageProps = {
  searchParams?: {
    period?: string | string[];
  };
};

const ageBucketMeta: Record<
  PendingAgeBucket["bucketKey"],
  { label: string; shortLabel: string; color: string; text: string }
> = {
  "0_7": { label: "ไม่เกิน 7 วัน", shortLabel: "≤ 7 วัน", color: "bg-success", text: "text-success" },
  "8_30": { label: "8–30 วัน", shortLabel: "8–30 วัน", color: "bg-brand", text: "text-brand" },
  "31_90": { label: "31–90 วัน", shortLabel: "31–90 วัน", color: "bg-warning", text: "text-warning" },
  over_90: { label: "มากกว่า 90 วัน", shortLabel: "> 90 วัน", color: "bg-danger", text: "text-danger" },
  unknown: { label: "ไม่ทราบวันที่รับเรื่อง", shortLabel: "ไม่ทราบวัน", color: "bg-muted", text: "text-muted" }
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short"
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDuration(hours: number | null) {
  if (hours === null) {
    return "ยังไม่มีข้อมูล";
  }

  if (hours < 24) {
    return `${formatDecimal(hours)} ชม.`;
  }

  return `${formatDecimal(hours / 24)} วัน`;
}

function Metric({ label, value, helper, tone = "text-ink" }: { label: string; value: string; helper: string; tone?: string }) {
  return (
    <div className="min-w-0 px-5 py-4 first:pl-0 last:pr-0 lg:border-r lg:border-border lg:last:border-r-0">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className={`mt-2 text-2xl font-semibold tracking-[-0.02em] ${tone}`}>{value}</dd>
      <p className="mt-1 text-xs leading-5 text-muted">{helper}</p>
    </div>
  );
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface px-5 py-8 text-center">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">{children}</p>
    </div>
  );
}

function TrendChart({ points }: { points: AnalyticsTrendPoint[] }) {
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.createdCount, point.closedCount]));

  if (points.length === 0) {
    return <EmptyState title="ยังไม่มีข้อมูลแนวโน้ม">เมื่อระบบมีวันที่รับเรื่องและประวัติเปลี่ยนสถานะ กราฟจะเริ่มแสดงที่นี่</EmptyState>;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-4 text-xs font-semibold text-muted">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand" aria-hidden="true" />
          เรื่องที่รับเข้า
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-success" aria-hidden="true" />
          เรื่องที่ตรวจพบว่าปิด
        </span>
      </div>
      <div className="overflow-x-auto pb-2">
        <div
          className="grid min-w-[620px] gap-2"
          style={{ gridTemplateColumns: `repeat(${points.length}, minmax(34px, 1fr))` }}
          role="img"
          aria-label="กราฟแท่งเปรียบเทียบจำนวนเรื่องรับเข้าและเรื่องที่ปิดรายสัปดาห์"
        >
          {points.map((point, index) => {
            const showLabel = index === 0 || index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / 6)) === 0;
            const createdHeight = point.createdCount > 0 ? Math.max(3, (point.createdCount / maxValue) * 100) : 0;
            const closedHeight = point.closedCount > 0 ? Math.max(3, (point.closedCount / maxValue) * 100) : 0;

            return (
              <div key={point.bucketStart} className="flex min-w-0 flex-col">
                <div className="flex h-52 items-end justify-center gap-1 border-b border-border/80 px-0.5">
                  <div
                    className="w-[42%] max-w-5 rounded-t-sm bg-brand"
                    style={{ height: `${createdHeight}%` }}
                    title={`สัปดาห์ ${formatDate(point.bucketStart)}: รับเข้า ${formatNumber(point.createdCount)} เรื่อง`}
                    aria-hidden="true"
                  />
                  <div
                    className="w-[42%] max-w-5 rounded-t-sm bg-success"
                    style={{ height: `${closedHeight}%` }}
                    title={`สัปดาห์ ${formatDate(point.bucketStart)}: ปิด ${formatNumber(point.closedCount)} เรื่อง`}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-2 min-h-9 text-center text-[10px] leading-4 text-muted">
                  {showLabel ? formatDate(point.bucketStart) : <span aria-hidden="true">·</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <details className="mt-3 rounded-2xl bg-surface px-4 py-3 text-sm text-muted">
        <summary className="cursor-pointer font-semibold text-ink">ดูตัวเลขรายสัปดาห์</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="border-b border-border py-2 pr-4">สัปดาห์เริ่ม</th>
                <th className="border-b border-border px-4 py-2 text-right">รับเข้า</th>
                <th className="border-b border-border py-2 pl-4 text-right">ปิด</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.bucketStart}>
                  <td className="border-b border-border/60 py-2 pr-4">{formatDate(point.bucketStart)}</td>
                  <td className="border-b border-border/60 px-4 py-2 text-right font-semibold text-brand">{formatNumber(point.createdCount)}</td>
                  <td className="border-b border-border/60 py-2 pl-4 text-right font-semibold text-success">{formatNumber(point.closedCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function PendingAgeChart({ buckets }: { buckets: PendingAgeBucket[] }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.pendingCount, 0);

  if (total === 0) {
    return <EmptyState title="ไม่มีเรื่องคงค้าง">เมื่อมีเรื่องคงค้าง ระบบจะแยกตามอายุงานให้โดยอัตโนมัติ</EmptyState>;
  }

  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-surface" aria-label={`เรื่องคงค้างทั้งหมด ${formatNumber(total)} เรื่อง`}>
        {buckets.map((bucket) => {
          const meta = ageBucketMeta[bucket.bucketKey] || ageBucketMeta.unknown;
          const percent = (bucket.pendingCount / total) * 100;
          return bucket.pendingCount > 0 ? (
            <span
              key={bucket.bucketKey}
              className={meta.color}
              style={{ width: `${percent}%` }}
              title={`${meta.label}: ${formatNumber(bucket.pendingCount)} เรื่อง (${formatDecimal(percent)}%)`}
            />
          ) : null;
        })}
      </div>
      <div className="mt-5 space-y-3">
        {buckets.map((bucket) => {
          const meta = ageBucketMeta[bucket.bucketKey] || ageBucketMeta.unknown;
          const percent = total > 0 ? (bucket.pendingCount / total) * 100 : 0;
          return (
            <div key={bucket.bucketKey} className="flex items-center justify-between gap-4 text-sm">
              <span className="inline-flex min-w-0 items-center gap-2 text-muted">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${meta.color}`} aria-hidden="true" />
                {meta.shortLabel}
              </span>
              <span className={`whitespace-nowrap font-semibold ${meta.text}`}>
                {formatNumber(bucket.pendingCount)} <span className="font-normal text-muted">({formatDecimal(percent)}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnalyticsContent({ data }: { data: AnalyticsReadyData }) {
  const hotspotMax = Math.max(1, ...data.hotspots.map((hotspot) => hotspot.totalCount));
  const departmentMax = Math.max(1, ...data.departmentResolution.map((department) => department.averageHours));

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-5 shadow-panel sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-ink">สัญญาณในช่วง {formatNumber(data.periodDays)} วัน</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              ใช้วันที่รับเรื่องสำหรับแนวโน้ม และใช้ประวัติเปลี่ยนสถานะจริงสำหรับตัวเลขการปิดเรื่อง
            </p>
          </div>
          <nav aria-label="เลือกช่วงเวลาวิเคราะห์" className="flex flex-wrap gap-2">
            {ANALYTICS_PERIODS.map((period) => (
              <Link
                key={period}
                href={`/analytics?period=${period}`}
                aria-current={period === data.periodDays ? "page" : undefined}
                className={
                  period === data.periodDays
                    ? "rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white"
                    : "rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold text-muted hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
                }
              >
                {period} วัน
              </Link>
            ))}
          </nav>
        </div>

        <dl className="mt-5 grid gap-x-1 border-t border-border pt-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="รับเรื่องเข้า" value={formatNumber(data.summary.createdCount)} helper={`ตามวันที่รับเรื่องใน ${data.periodDays} วัน`} />
          <Metric label="ตรวจพบว่าปิด" value={formatNumber(data.summary.closedCount)} helper="นับการเปลี่ยนเข้าสถานะปิดครั้งแรก" tone="text-success" />
          <Metric label="มัธยฐานเวลาปิด" value={formatDuration(data.summary.medianCloseHours)} helper={`จากตัวอย่าง ${formatNumber(data.summary.closeSampleCount)} เรื่อง`} />
          <Metric label="คงค้างปัจจุบัน" value={formatNumber(data.summary.pendingNow)} helper={`พิกัดพร้อมใช้ ${formatDecimal(data.summary.coordinateCoveragePercent)}%`} tone="text-warning" />
        </dl>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-3xl bg-white p-5 shadow-panel sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-ink">แนวโน้มรับเข้าเทียบกับปิดเรื่อง</h2>
            <p className="mt-1 text-sm leading-6 text-muted">รวมเป็นรายสัปดาห์เพื่อเห็นจังหวะงานโดยไม่ตีความจากความผันผวนรายวันมากเกินไป</p>
          </div>
          <TrendChart points={data.trend} />
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-panel sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-ink">อายุเรื่องคงค้าง</h2>
            <p className="mt-1 text-sm leading-6 text-muted">มองภาระสะสมทั้งหมด ณ ตอนนี้ แยกจากตัวกรองช่วงเวลาด้านบน</p>
          </div>
          <PendingAgeChart buckets={data.pendingAgeBuckets} />
          <Link href="/cases?view=pending" className="mt-6 inline-flex rounded-2xl bg-surface px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand/10">
            เปิดทะเบียนเรื่องคงค้าง
          </Link>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl bg-white p-5 shadow-panel sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-ink">พื้นที่ที่รับเรื่องหนาแน่น</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">จัดกลุ่มจุดพิกัดในกรอบประมาณ 500 เมตร ภายในช่วงเวลาที่เลือก</p>
            </div>
            <Link href="/map?view=all" className="shrink-0 rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold text-brand hover:border-brand/30 hover:bg-brand/5">
              เปิดแผนที่
            </Link>
          </div>

          {data.hotspots.length === 0 ? (
            <div className="mt-5">
              <EmptyState title="ยังไม่พบกลุ่มพื้นที่ในช่วงนี้">ลองขยายเป็น 180 วัน หรือตรวจว่าข้อมูลนำเข้ามีพิกัดครบถ้วน</EmptyState>
            </div>
          ) : (
            <ol className="mt-5 space-y-4">
              {data.hotspots.map((hotspot, index) => {
                const width = Math.max(4, (hotspot.totalCount / hotspotMax) * 100);
                return (
                  <li key={`${hotspot.lat}-${hotspot.lng}`} className="rounded-2xl bg-surface p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div>
                            <h3 className="text-sm font-semibold text-ink">แขวง{hotspot.subdistrict.replace(/^แขวง/, "")}</h3>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{hotspot.sampleAddress || `${formatDecimal(hotspot.lat)}, ${formatDecimal(hotspot.lng)}`}</p>
                          </div>
                          <p className="whitespace-nowrap text-sm font-semibold text-ink">
                            {formatNumber(hotspot.totalCount)} เรื่อง <span className="font-normal text-warning">· ค้าง {formatNumber(hotspot.pendingCount)}</span>
                          </p>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white" aria-hidden="true">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-panel sm:p-6">
          <div>
            <h2 className="text-xl font-semibold text-ink">เวลาปิดเรื่องแยกตามฝ่าย</h2>
            <p className="mt-1 text-sm leading-6 text-muted">เรียงฝ่ายที่มีค่าเฉลี่ยน้อยกว่าไว้ก่อน พร้อมจำนวนตัวอย่างเพื่อใช้ประกอบการอ่าน</p>
          </div>

          {data.departmentResolution.length === 0 ? (
            <div className="mt-5">
              <EmptyState title="ยังไม่มีตัวอย่างเพียงพอ">ต้องมีประวัติเปลี่ยนสถานะจากเปิดเป็นปิดก่อน จึงจะเปรียบเทียบเวลาแต่ละฝ่ายได้</EmptyState>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {data.departmentResolution.map((department) => {
                const width = Math.max(4, (department.averageHours / departmentMax) * 100);
                return (
                  <div key={department.departmentName}>
                    <div className="flex items-start justify-between gap-4 text-sm">
                      <p className="min-w-0 font-medium leading-5 text-ink">{department.departmentName}</p>
                      <p className="shrink-0 text-right font-semibold text-brand">
                        {formatDuration(department.averageHours)}
                        <span className="ml-1 font-normal text-muted">({formatNumber(department.closedCount)})</span>
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                      <div className="h-full rounded-full bg-brand/70" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-brand/15 bg-brand/5 px-5 py-4 text-sm leading-6 text-brand">
        <p className="font-semibold">วิธีอ่านตัวเลขเวลาปิดเรื่อง</p>
        <p className="mt-1 max-w-4xl">
          ระบบนับจากวันที่รับเรื่องถึงครั้งแรกที่ตรวจพบการเปลี่ยนเข้าสถานะปิด จึงไม่รวมเรื่องที่ปิดไปแล้วก่อนเริ่มเก็บประวัติ และไม่ใช้ `last_activity` แทนเวลาปิด เพื่อไม่ทำให้ตัวเลขดูแม่นยำเกินข้อมูลจริง
        </p>
        <p className="mt-2 text-xs text-muted">ประมวลผลล่าสุด {formatDateTime(data.generatedAt)} · ค่าเฉลี่ยรวม {formatDuration(data.summary.averageCloseHours)}</p>
      </section>
    </div>
  );
}

export default async function AnalyticsPage({ searchParams = {} }: AnalyticsPageProps) {
  const periodDays = getAnalyticsPeriodDays(searchParams.period);
  const data = await getAnalyticsData(periodDays);

  return (
    <AppShell
      title="วิเคราะห์แนวโน้ม"
      description="ติดตามภาระงานตามช่วงเวลา จุดที่รับเรื่องหนาแน่น อายุเรื่องคงค้าง และเวลาปิดเรื่องจากข้อมูลที่ระบบตรวจพบจริง"
    >
      {data.status === "missing_env" ? (
        <section className="rounded-3xl border border-warning/20 bg-warning/10 p-6">
          <h2 className="text-xl font-semibold text-warning">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-warning">ต้องตั้งค่า Supabase admin env ก่อนจึงจะดูข้อมูลวิเคราะห์ได้</p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-3xl border border-danger/20 bg-danger/5 p-6">
          <h2 className="text-xl font-semibold text-danger">โหลดข้อมูลวิเคราะห์ไม่ได้ชั่วคราว</h2>
          <p className="mt-3 text-sm leading-6 text-danger">{data.message}</p>
          <p className="mt-2 text-xs leading-5 text-muted">หากเพิ่งอัปเดตโค้ด ให้ตรวจว่า migration analytics ถูก apply ใน Supabase แล้ว</p>
        </section>
      ) : (
        <AnalyticsContent data={data} />
      )}
    </AppShell>
  );
}
