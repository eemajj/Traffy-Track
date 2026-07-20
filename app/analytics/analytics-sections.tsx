import Link from "next/link";
import type { ReactNode } from "react";

import {
  ANALYTICS_PERIODS,
  AnalyticsReadyData,
  AnalyticsTrendPoint,
  PendingAgeBucket
} from "@/lib/analytics";
import {
  analyticsAgeBucketMeta as ageBucketMeta,
  formatAnalyticsChange as formatChange,
  formatAnalyticsCoordinate as formatCoordinate,
  formatAnalyticsDate as formatDate,
  formatAnalyticsDateTime as formatDateTime,
  formatAnalyticsDecimal as formatDecimal,
  formatAnalyticsDuration as formatDuration,
  formatAnalyticsNumber as formatNumber
} from "@/lib/analytics/page-model";

function Metric({ label, value, helper, tone = "text-ink" }: { label: string; value: string; helper: string; tone?: string }) {
  return (
    <div className="min-w-0 bg-white p-4 sm:p-5">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`mt-1.5 text-2xl font-semibold tracking-[-0.02em] ${tone}`}>{value}</dd>
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

  const chart = { width: 760, height: 270, left: 48, right: 14, top: 14, bottom: 38 };
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const x = (index: number) => chart.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => chart.top + plotHeight - (value / maxValue) * plotHeight;
  const linePath = (field: "createdCount" | "closedCount") =>
    points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(point[field]).toFixed(2)}`).join(" ");
  const yTicks = [1, 0.75, 0.5, 0.25, 0];
  const labelCount = Math.min(6, points.length);
  const labelIndexes = new Set(
    Array.from({ length: labelCount }, (_, index) =>
      labelCount === 1 ? 0 : Math.round((index * (points.length - 1)) / (labelCount - 1))
    )
  );

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap gap-4 text-xs font-semibold text-muted">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full" style={{ background: "var(--chart-created)" }} aria-hidden="true" />
          เรื่องที่รับเข้า
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-5 border-t-2 border-dashed" style={{ borderColor: "var(--chart-closed)" }} aria-hidden="true" />
          เรื่องที่ตรวจพบว่าปิด
        </span>
      </div>
      <div className="w-full overflow-hidden rounded-xl bg-surface/55 px-2 py-3 sm:px-4">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="block h-auto w-full"
          role="img"
          aria-labelledby="trend-chart-title trend-chart-description"
        >
          <title id="trend-chart-title">แนวโน้มเรื่องรับเข้าและเรื่องที่ปิดรายสัปดาห์</title>
          <desc id="trend-chart-description">กราฟเส้นเปรียบเทียบข้อมูล {formatNumber(points.length)} สัปดาห์</desc>
          {yTicks.map((ratio) => {
            const tickY = chart.top + plotHeight * (1 - ratio);
            return (
              <g key={ratio}>
                <line x1={chart.left} x2={chart.width - chart.right} y1={tickY} y2={tickY} stroke="var(--border)" strokeWidth="1" opacity="0.7" />
                <text x={chart.left - 9} y={tickY + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
                  {formatNumber(Math.round(maxValue * ratio))}
                </text>
              </g>
            );
          })}
          {points.map((point, index) =>
            labelIndexes.has(index) ? (
              <text key={point.bucketStart} x={x(index)} y={chart.height - 11} textAnchor="middle" fontSize="11" fill="var(--muted)">
                {formatDate(point.bucketStart)}
              </text>
            ) : null
          )}
          <path d={linePath("createdCount")} fill="none" stroke="var(--chart-created)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d={linePath("closedCount")}
            fill="none"
            stroke="var(--chart-closed)"
            strokeWidth="3"
            strokeDasharray="8 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((point, index) => (
            <g key={`points-${point.bucketStart}`}>
              <circle cx={x(index)} cy={y(point.createdCount)} r="3.25" fill="var(--surface-elevated)" stroke="var(--chart-created)" strokeWidth="2">
                <title>{`${formatDate(point.bucketStart)} รับเข้า ${formatNumber(point.createdCount)} เรื่อง`}</title>
              </circle>
              <rect
                x={x(index) - 3}
                y={y(point.closedCount) - 3}
                width="6"
                height="6"
                rx="1"
                fill="var(--surface-elevated)"
                stroke="var(--chart-closed)"
                strokeWidth="2"
              >
                <title>{`${formatDate(point.bucketStart)} ปิด ${formatNumber(point.closedCount)} เรื่อง`}</title>
              </rect>
            </g>
          ))}
        </svg>
      </div>
      <details className="mt-3 rounded-xl border border-border bg-white px-4 py-3 text-sm text-muted">
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
                  <td className="border-b border-border/60 px-4 py-2 text-right font-semibold" style={{ color: "var(--chart-created)" }}>{formatNumber(point.createdCount)}</td>
                  <td className="border-b border-border/60 py-2 pl-4 text-right font-semibold" style={{ color: "var(--chart-closed)" }}>{formatNumber(point.closedCount)}</td>
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
  const maxBucket = Math.max(1, ...buckets.map((bucket) => bucket.pendingCount));

  if (total === 0) {
    return <EmptyState title="ไม่มีเรื่องคงค้าง">เมื่อมีเรื่องคงค้าง ระบบจะแยกตามอายุงานให้โดยอัตโนมัติ</EmptyState>;
  }

  return (
    <div className="min-w-0">
      <div className="flex items-end justify-between gap-4">
        <p className="text-sm text-muted">คงค้างทั้งหมด</p>
        <p className="text-2xl font-semibold tracking-[-0.02em] text-ink">{formatNumber(total)} <span className="text-sm font-medium text-muted">เรื่อง</span></p>
      </div>
      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-surface" aria-label={`เรื่องคงค้างทั้งหมด ${formatNumber(total)} เรื่อง`}>
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
      <div className="mt-5 space-y-4">
        {buckets.map((bucket) => {
          const meta = ageBucketMeta[bucket.bucketKey] || ageBucketMeta.unknown;
          const percent = total > 0 ? (bucket.pendingCount / total) * 100 : 0;
          return (
            <div key={bucket.bucketKey}>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2 text-muted">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${meta.color}`} aria-hidden="true" />
                  {meta.shortLabel}
                </span>
                <span className={`whitespace-nowrap font-semibold ${meta.text}`}>
                  {formatNumber(bucket.pendingCount)} <span className="font-normal text-muted">({formatDecimal(percent)}%)</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                <div className={`h-full rounded-full ${meta.color}`} style={{ width: `${(bucket.pendingCount / maxBucket) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AnalyticsContent({ data }: { data: AnalyticsReadyData }) {
  const departmentMax = Math.max(1, ...data.departmentResolution.map((department) => department.averageHours));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-ink">สัญญาณในช่วง {formatNumber(data.periodDays)} วัน</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              ใช้วันที่รับเรื่องสำหรับแนวโน้ม และใช้ประวัติเปลี่ยนสถานะจริงสำหรับตัวเลขการปิดเรื่อง
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label="เลือกช่วงเวลาวิเคราะห์" className="flex rounded-xl bg-surface p-1">
              {ANALYTICS_PERIODS.map((period) => (
                <Link
                  key={period}
                  href={`/analytics?period=${period}`}
                  aria-current={period === data.periodDays ? "page" : undefined}
                  className={
                    period === data.periodDays
                      ? "inline-flex min-h-10 items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand shadow-sm"
                      : "inline-flex min-h-10 items-center rounded-lg px-4 py-2 text-sm font-semibold text-muted hover:bg-white/70 hover:text-ink"
                  }
                >
                  {period} วัน
                </Link>
              ))}
            </nav>
            <a
              href={`/api/executive-summary/pdf?period=${data.periodDays}`}
              aria-label="ดาวน์โหลดสรุปผู้บริหาร PDF"
              className="inline-flex min-h-11 items-center rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-brand hover:border-brand/35 hover:bg-brand/5"
            >
              ดาวน์โหลด PDF
            </a>
          </div>
        </div>

        <dl className="mt-5 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="รับเรื่องเข้า" value={formatNumber(data.summary.createdCount)} helper={`ตามวันที่รับเรื่องใน ${data.periodDays} วัน`} />
          <Metric label="ตรวจพบว่าปิด" value={formatNumber(data.summary.closedCount)} helper="นับการเปลี่ยนเข้าสถานะปิดครั้งแรก" tone="text-success" />
          <Metric label="มัธยฐานเวลาปิด" value={formatDuration(data.summary.medianCloseHours)} helper={`จากตัวอย่าง ${formatNumber(data.summary.closeSampleCount)} เรื่อง`} />
          <Metric label="คงค้างปัจจุบัน" value={formatNumber(data.summary.pendingNow)} helper={`พิกัดพร้อมใช้ ${formatDecimal(data.summary.coordinateCoveragePercent)}%`} tone="text-warning" />
        </dl>
        <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2">
          <div className="flex items-center justify-between bg-white px-4 py-3">
            <div><p className="text-sm font-semibold text-ink">เรื่องรับเข้าเทียบช่วงก่อนหน้า</p><p className="mt-1 text-xs text-muted">ช่วงก่อนหน้า {formatNumber(data.comparison.createdCount)} เรื่อง</p></div>
            <span className={data.comparison.createdChangePercent !== null && data.comparison.createdChangePercent > 0 ? "font-semibold text-warning" : "font-semibold text-success"}>{formatChange(data.comparison.createdChangePercent)}</span>
          </div>
          <div className="flex items-center justify-between bg-white px-4 py-3">
            <div><p className="text-sm font-semibold text-ink">เรื่องที่ปิดเทียบช่วงก่อนหน้า</p><p className="mt-1 text-xs text-muted">ช่วงก่อนหน้า {formatNumber(data.comparison.closedCount)} เรื่อง</p></div>
            <span className="font-semibold text-brand">{formatChange(data.comparison.closedChangePercent)}</span>
          </div>
        </div>
      </section>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.5fr)]">
        <section className="min-w-0 rounded-2xl border border-border bg-white p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-ink">แนวโน้มรับเข้าเทียบกับปิดเรื่อง</h2>
            <p className="mt-1 text-sm leading-6 text-muted">รวมเป็นรายสัปดาห์เพื่อเห็นจังหวะงานโดยไม่ตีความจากความผันผวนรายวันมากเกินไป</p>
          </div>
          <TrendChart points={data.trend} />
        </section>

        <section className="min-w-0 rounded-2xl border border-border bg-white p-5 sm:p-6">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-ink">อายุเรื่องคงค้าง</h2>
            <p className="mt-1 text-sm leading-6 text-muted">มองภาระสะสมทั้งหมด ณ ตอนนี้ แยกจากตัวกรองช่วงเวลาด้านบน</p>
          </div>
          <PendingAgeChart buckets={data.pendingAgeBuckets} />
          <Link href="/cases?view=pending" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-surface px-4 py-2.5 text-sm font-semibold text-brand hover:bg-brand/10">
            เปิดทะเบียนเรื่องคงค้าง
          </Link>
        </section>
      </div>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(19rem,0.9fr)]">
        <section className="min-w-0 rounded-2xl border border-border bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-ink">จุดรับเรื่องที่กระจุกตัว</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                รวมเรื่องที่รับเข้าในช่วง {formatNumber(data.periodDays)} วันตามระยะจริงรัศมี 500 เมตร โดยหนึ่งเรื่องนับได้เพียงกลุ่มเดียว
              </p>
            </div>
            <Link href="/map?view=all" className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-brand hover:border-brand/30 hover:bg-brand/5">
              เปิดแผนที่
            </Link>
          </div>

          {data.hotspotsUnavailableMessage ? (
            <div className="mt-5 rounded-2xl border border-warning/20 bg-warning/10 p-4 text-sm leading-6 text-warning">
              ข้อมูลจุดกระจุกตัวยังไม่พร้อมใช้งานชั่วคราว แต่ข้อมูลวิเคราะห์ส่วนอื่นยังใช้งานได้
            </div>
          ) : data.hotspots.length === 0 ? (
            <div className="mt-5">
              <EmptyState title="ยังไม่พบกลุ่มพื้นที่ในช่วงนี้">ลองขยายเป็น 180 วัน หรือตรวจว่าข้อมูลนำเข้ามีพิกัดครบถ้วน</EmptyState>
            </div>
          ) : (
            <ol className="mt-5 space-y-4">
              {data.hotspots.map((hotspot, index) => {
                const pendingPercent = hotspot.totalCount > 0 ? (hotspot.pendingCount / hotspot.totalCount) * 100 : 0;
                const closedPercent = hotspot.totalCount > 0 ? (hotspot.closedCount / hotspot.totalCount) * 100 : 0;
                const mapHref = `/map?view=all&period=${encodeURIComponent(data.periodDays)}&focusLat=${encodeURIComponent(hotspot.lat)}&focusLng=${encodeURIComponent(hotspot.lng)}&focusRadius=${encodeURIComponent(hotspot.radiusMeters)}`;
                return (
                  <li key={`${hotspot.lat}-${hotspot.lng}`} className="rounded-2xl bg-surface p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div>
                            <h3 className="text-sm font-semibold leading-5 text-ink">
                              {hotspot.sampleAddress || `บริเวณแขวง${hotspot.subdistrict.replace(/^แขวง/, "")}`}
                            </h3>
                            <p className="mt-1 text-xs leading-5 text-muted">
                              แขวง{hotspot.subdistrict.replace(/^แขวง/, "")} · รัศมี {formatNumber(hotspot.radiusMeters)} ม. · {formatCoordinate(hotspot.lat)}, {formatCoordinate(hotspot.lng)}
                            </p>
                          </div>
                          <p className="whitespace-nowrap text-sm font-semibold text-brand">
                            {formatNumber(hotspot.totalCount)} เรื่อง
                          </p>
                        </div>
                        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                          <div className="flex items-baseline gap-1">
                            <dt className="text-muted">ยังเปิด</dt>
                            <dd className="font-semibold text-warning">{formatNumber(hotspot.pendingCount)}</dd>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <dt className="text-muted">ปิดแล้ว</dt>
                            <dd className="font-semibold text-success">{formatNumber(hotspot.closedCount)}</dd>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <dt className="text-muted">สัดส่วนเรื่องรับเข้าช่วงนี้</dt>
                            <dd className="font-semibold text-ink">{formatDecimal(hotspot.sharePercent)}%</dd>
                          </div>
                        </dl>
                        <div
                          className="mt-3 flex h-2 overflow-hidden rounded-full bg-white"
                          role="img"
                          aria-label={`ยังเปิด ${formatNumber(hotspot.pendingCount)} เรื่อง ปิดแล้ว ${formatNumber(hotspot.closedCount)} เรื่อง`}
                        >
                          {hotspot.closedCount > 0 ? <span className="h-full bg-success" style={{ width: `${closedPercent}%` }} /> : null}
                          {hotspot.pendingCount > 0 ? <span className="h-full bg-warning" style={{ width: `${pendingPercent}%` }} /> : null}
                        </div>
                        <Link href={mapHref} className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-brand hover:text-brand-deep">
                          ดูตำแหน่งและวงรัศมีบนแผนที่ →
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="min-w-0 rounded-2xl border border-border bg-white p-5 sm:p-6">
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
