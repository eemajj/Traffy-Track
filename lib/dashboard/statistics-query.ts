import { unstable_cache } from "next/cache";

import type { DashboardMetricScope } from "@/lib/dashboard";
import {
  getBangkokRangeBounds,
  isExternalAgencyOrgResponse,
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

async function loadDashboardStatistics(
  range: DashboardDateRange,
  scope: DashboardMetricScope = "district"
): Promise<DashboardStatisticsData> {
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
        .select("ticket_id, type, timestamp, last_activity, state, star, org_response, dept_list")
        .gte("timestamp", startAt)
        .lt("timestamp", endAt)
        .order("ticket_id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (result.error) throw new Error(`โหลดสถิติ Dashboard ไม่สำเร็จ: ${result.error.message}`);
      const page = (result.data || []) as Array<
        DashboardStatisticsTicket & { org_response: string | null; dept_list: string[] | null }
      >;

      const filteredPage = scope === "district"
        ? page.filter((t) => {
            const hasDept = t.dept_list && t.dept_list.length > 0;
            const { isExternal } = isExternalAgencyOrgResponse(t.org_response);
            return hasDept || !isExternal;
          })
        : scope === "external"
        ? page.filter((t) => {
            const hasDept = t.dept_list && t.dept_list.length > 0;
            const { isExternal } = isExternalAgencyOrgResponse(t.org_response);
            return !hasDept && (isExternal || t.state === "ส่งต่อ(ใหม่)");
          })
        : page;

      tickets.push(...filteredPage);
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
  async (rangeKey: string, fromDate: string, toDate: string, scope: DashboardMetricScope) =>
    loadDashboardStatistics({ from: fromDate, to: toDate }, scope),
  [DASHBOARD_STATISTICS_CACHE_TAG],
  { revalidate: 60, tags: [DASHBOARD_STATISTICS_CACHE_TAG] }
);

export function getDashboardStatistics(range: DashboardDateRange, scope: DashboardMetricScope = "district") {
  return getCachedDashboardStatistics(`${range.from}_${range.to}_${scope}`, range.from, range.to, scope);
}
