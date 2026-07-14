import { unstable_noStore as noStore } from "next/cache";

import { ANALYTICS_PERIODS } from "@/lib/analytics-period";
import type { AnalyticsPeriodDays } from "@/lib/analytics-period";
export { ANALYTICS_PERIODS, getAnalyticsPeriodDays } from "@/lib/analytics-period";
export type { AnalyticsPeriodDays } from "@/lib/analytics-period";
import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";

export type AnalyticsTrendPoint = {
  bucketStart: string;
  createdCount: number;
  closedCount: number;
};

export type AnalyticsHotspot = {
  subdistrict: string;
  sampleAddress: string | null;
  lat: number;
  lng: number;
  radiusMeters: number;
  totalCount: number;
  pendingCount: number;
  closedCount: number;
  sharePercent: number;
};

export type DepartmentResolution = {
  departmentName: string;
  closedCount: number;
  averageHours: number;
};

export type PendingAgeBucket = {
  bucketKey: "0_7" | "8_30" | "31_90" | "over_90" | "unknown";
  pendingCount: number;
};

export type AnalyticsReadyData = {
  status: "ready";
  generatedAt: string;
  periodDays: AnalyticsPeriodDays;
  summary: {
    createdCount: number;
    closedCount: number;
    closeSampleCount: number;
    averageCloseHours: number | null;
    medianCloseHours: number | null;
    pendingNow: number;
    coordinateCoveragePercent: number;
  };
  trend: AnalyticsTrendPoint[];
  hotspots: AnalyticsHotspot[];
  hotspotsUnavailableMessage: string | null;
  departmentResolution: DepartmentResolution[];
  pendingAgeBuckets: PendingAgeBucket[];
};

export type AnalyticsData =
  | { status: "missing_env"; periodDays: AnalyticsPeriodDays }
  | { status: "unavailable"; periodDays: AnalyticsPeriodDays; message: string }
  | AnalyticsReadyData;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toRecords(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function normalizeHotspots(value: unknown): AnalyticsHotspot[] {
  return toRecords(value).flatMap((row) => {
    const lat = toNumber(row.lat, Number.NaN);
    const lng = toNumber(row.lng, Number.NaN);
    const radiusMeters = toNumber(row.radiusMeters, Number.NaN);
    const totalCount = Math.max(0, Math.trunc(toNumber(row.totalCount)));
    const pendingCount = Math.min(totalCount, Math.max(0, Math.trunc(toNumber(row.pendingCount))));

    if (
      !Number.isFinite(lat)
      || !Number.isFinite(lng)
      || !Number.isFinite(radiusMeters)
      || lat < 13.3
      || lat > 14.2
      || lng < 100.2
      || lng > 101.1
      || radiusMeters < 100
      || radiusMeters > 2000
      || totalCount < 1
    ) {
      return [];
    }

    return [{
      subdistrict: toStringValue(row.subdistrict, "ไม่ระบุแขวง"),
      sampleAddress: row.sampleAddress === null ? null : toStringValue(row.sampleAddress) || null,
      lat,
      lng,
      radiusMeters,
      totalCount,
      pendingCount,
      closedCount: totalCount - pendingCount,
      sharePercent: Math.min(100, Math.max(0, toNumber(row.sharePercent)))
    }];
  });
}

function normalizeAnalyticsPayload(payload: unknown, fallbackPeriod: AnalyticsPeriodDays): AnalyticsReadyData {
  if (!isRecord(payload)) {
    throw new Error("รูปแบบข้อมูลวิเคราะห์จากฐานข้อมูลไม่ถูกต้อง");
  }

  const summary = isRecord(payload.summary) ? payload.summary : {};
  const rawPeriodDays = toNumber(payload.periodDays, fallbackPeriod);
  const periodDays = ANALYTICS_PERIODS.includes(rawPeriodDays as AnalyticsPeriodDays)
    ? (rawPeriodDays as AnalyticsPeriodDays)
    : fallbackPeriod;

  return {
    status: "ready",
    generatedAt: toStringValue(payload.generatedAt, new Date().toISOString()),
    periodDays,
    summary: {
      createdCount: toNumber(summary.createdCount),
      closedCount: toNumber(summary.closedCount),
      closeSampleCount: toNumber(summary.closeSampleCount),
      averageCloseHours: toNullableNumber(summary.averageCloseHours),
      medianCloseHours: toNullableNumber(summary.medianCloseHours),
      pendingNow: toNumber(summary.pendingNow),
      coordinateCoveragePercent: toNumber(summary.coordinateCoveragePercent)
    },
    trend: toRecords(payload.trend).map((row) => ({
      bucketStart: toStringValue(row.bucketStart),
      createdCount: toNumber(row.createdCount),
      closedCount: toNumber(row.closedCount)
    })),
    hotspots: normalizeHotspots(payload.hotspots),
    hotspotsUnavailableMessage: toStringValue(payload.hotspotsUnavailableMessage) || null,
    departmentResolution: toRecords(payload.departmentResolution).map((row) => ({
      departmentName: toStringValue(row.departmentName, "ไม่ระบุฝ่าย"),
      closedCount: toNumber(row.closedCount),
      averageHours: toNumber(row.averageHours)
    })),
    pendingAgeBuckets: toRecords(payload.pendingAgeBuckets).map((row) => ({
      bucketKey: toStringValue(row.bucketKey, "unknown") as PendingAgeBucket["bucketKey"],
      pendingCount: toNumber(row.pendingCount)
    }))
  };
}

export async function getAnalyticsData(periodDays: AnalyticsPeriodDays): Promise<AnalyticsData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env", periodDays };
  }

  try {
    noStore();

    const supabase = createSupabaseAdminClient();
    const [overviewResult, hotspotsResult] = await Promise.all([
      supabase.rpc("analytics_overview", { p_days: periodDays }),
      supabase.rpc("analytics_radius_hotspots", {
        p_days: periodDays,
        p_radius_m: 500,
        p_limit: 8
      })
    ]);

    if (overviewResult.error) {
      throw new Error(`โหลดข้อมูลวิเคราะห์ไม่สำเร็จ: ${overviewResult.error.message}`);
    }
    const overview = isRecord(overviewResult.data) ? overviewResult.data : {};
    return normalizeAnalyticsPayload(
      {
        ...overview,
        hotspots: hotspotsResult.error ? [] : hotspotsResult.data,
        hotspotsUnavailableMessage: hotspotsResult.error
          ? `โหลดกลุ่มพื้นที่ไม่สำเร็จ: ${hotspotsResult.error.message}`
          : null
      },
      periodDays
    );
  } catch (error) {
    return {
      status: "unavailable",
      periodDays,
      message: error instanceof Error ? error.message : "ข้อมูลวิเคราะห์ยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}
