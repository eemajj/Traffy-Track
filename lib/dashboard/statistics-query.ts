import { unstable_cache } from "next/cache";

import {
  getBangkokRangeBounds,
  summarizeDashboardTickets,
  validateDashboardDateRange
} from "@/lib/dashboard/statistics";
import type {
  DashboardDateRange,
  DashboardStatisticsData,
  DashboardStatisticsTicket
} from "@/lib/dashboard/statistics";
import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";

const PAGE_SIZE = 1000;

async function loadDashboardStatistics(range: DashboardDateRange): Promise<DashboardStatisticsData> {
  const rangeError = validateDashboardDateRange(range);
  if (rangeError) return { status: "invalid_range", range, message: rangeError };
  if (!hasSupabaseAdminEnv()) return { status: "missing_env", range };

  try {
    const supabase = createSupabaseAdminClient();
    const { startAt, endAt } = getBangkokRangeBounds(range);
    const tickets: DashboardStatisticsTicket[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const result = await supabase
        .from("tickets")
        .select("ticket_id, type, timestamp, last_activity, state, star")
        .gte("timestamp", startAt)
        .lt("timestamp", endAt)
        .order("ticket_id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (result.error) throw new Error(`โหลดสถิติ Dashboard ไม่สำเร็จ: ${result.error.message}`);
      const page = (result.data || []) as DashboardStatisticsTicket[];
      tickets.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    return summarizeDashboardTickets(tickets, range);
  } catch (error) {
    return {
      status: "unavailable",
      range,
      message: error instanceof Error ? error.message : "ข้อมูลสถิติ Dashboard ยังไม่พร้อมใช้งาน"
    };
  }
}

export const DASHBOARD_STATISTICS_CACHE_TAG = "dashboard-statistics";

const getCachedDashboardStatistics = unstable_cache(
  loadDashboardStatistics,
  [DASHBOARD_STATISTICS_CACHE_TAG],
  { revalidate: 60, tags: [DASHBOARD_STATISTICS_CACHE_TAG] }
);

export function getDashboardStatistics(range: DashboardDateRange) {
  return getCachedDashboardStatistics(range);
}
