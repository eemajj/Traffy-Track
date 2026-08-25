import { unstable_cache } from "next/cache";

import type { DashboardMetricScope } from "@/lib/dashboard";
import {
  getBangkokRangeBounds,
  isExternalAgencyOrgResponse,
  summarizeDashboardOverview,
  summarizeDashboardTickets,
  validateDashboardDateRange
} from "@/lib/dashboard/statistics";
import type {
  DashboardDateRange,
  DashboardRangeOverviewJson,
  DashboardStatisticsData,
  DashboardStatisticsTicket
} from "@/lib/dashboard/statistics";
import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";

const PAGE_SIZE = 1000;

// Tri-state capability caches: null = unknown, false = migration not applied yet.
let ticketOriginColumnAvailable: boolean | null = null;
let overviewRpcAvailable: boolean | null = null;

function isMissingTicketOriginColumn(message: string) {
  return message.includes("ticket_origin");
}

function isMissingOverviewRpc(message: string) {
  return (
    message.includes("dashboard_range_overview")
    || message.includes("42883")
    || message.includes("PGRST202")
  );
}

async function loadOverviewViaRpc(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  startAt: string,
  endAt: string,
  scope: DashboardMetricScope,
  dept?: string
): Promise<DashboardStatisticsData | null> {
  if (overviewRpcAvailable === false) return null;

  const result = await supabase.rpc("dashboard_range_overview", {
    p_from: startAt,
    p_to: endAt,
    p_scope: scope,
    p_dept: dept || null
  });

  if (!result.error && result.data) {
    overviewRpcAvailable = true;
    return summarizeDashboardOverview(result.data as unknown as DashboardRangeOverviewJson, {
      // Range bounds are ISO strings; rebuild the logical range for the summary.
      from: new Date(startAt).toISOString().slice(0, 10),
      to: new Date(endAt).toISOString().slice(0, 10)
    });
  }

  const message = result.error?.message || "";
  if (isMissingOverviewRpc(message)) {
    // Migration 20260825140000 not applied yet — fall back to row loading.
    overviewRpcAvailable = false;
    return null;
  }
  throw new Error(`โหลดสถิติ Dashboard ไม่สำเร็จ: ${message}`);
}

async function loadStatisticsFromRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  startAt: string,
  endAt: string,
  range: DashboardDateRange,
  scope: DashboardMetricScope,
  dept?: string
): Promise<DashboardStatisticsData> {
  const tickets: DashboardStatisticsTicket[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const selectColumns = ticketOriginColumnAvailable === false
      ? "ticket_id, type, timestamp, last_activity, state, star, org_response, dept_list"
      : "ticket_id, type, timestamp, last_activity, state, star, org_response, dept_list, ticket_origin";

    const result = await supabase
      .from("tickets")
      .select(selectColumns)
      .gte("timestamp", startAt)
      .lt("timestamp", endAt)
      .order("ticket_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    // Graceful degradation before migration 20260825120000 lands.
    if (result.error && ticketOriginColumnAvailable !== false && isMissingTicketOriginColumn(result.error.message)) {
      ticketOriginColumnAvailable = false;
      continue;
    }

    if (result.error) throw new Error(`โหลดสถิติ Dashboard ไม่สำเร็จ: ${result.error.message}`);
    // The page succeeded with ticket_origin selected, so the column exists.
    if (ticketOriginColumnAvailable === null) {
      ticketOriginColumnAvailable = true;
    }
    const page = (result.data || []) as unknown as Array<
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
          if (hasDept) return false;
          const { isExternal } = isExternalAgencyOrgResponse(t.org_response);
          return isExternal
            || t.state === "ส่งต่อ(ใหม่)"
            || t.ticket_origin === "external_intake";
        })
      : page;

    const finalPage = dept
      ? filteredPage.filter((t) => t.dept_list && t.dept_list.includes(dept))
      : filteredPage;

    tickets.push(...finalPage);
    if (page.length < PAGE_SIZE) break;
  }

  return summarizeDashboardTickets(tickets, range);
}

async function loadDashboardStatistics(
  range: DashboardDateRange,
  scope: DashboardMetricScope = "district",
  dept?: string
): Promise<DashboardStatisticsData> {
  const rangeError = validateDashboardDateRange(range);
  if (rangeError) return { status: "invalid_range", range, message: rangeError };
  if (!hasSupabaseAdminEnv()) return { status: "missing_env", range };

  try {
    const supabase = createSupabaseAdminClient();
    const { startAt, endAt } = getBangkokRangeBounds(range);

    // Stage 2.2 fast path: pre-aggregated counts in Postgres, zero raw rows.
    const viaRpc = await loadOverviewViaRpc(supabase, startAt, endAt, scope, dept);
    if (viaRpc) return viaRpc;

    return await loadStatisticsFromRows(supabase, startAt, endAt, range, scope, dept);
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
  async (rangeKey: string, fromDate: string, toDate: string, scope: DashboardMetricScope, dept?: string) =>
    loadDashboardStatistics({ from: fromDate, to: toDate }, scope, dept),
  [DASHBOARD_STATISTICS_CACHE_TAG],
  { revalidate: 60, tags: [DASHBOARD_STATISTICS_CACHE_TAG] }
);

export function getDashboardStatistics(
  range: DashboardDateRange,
  scope: DashboardMetricScope = "district",
  dept?: string
) {
  const cacheKey = `${range.from}_${range.to}_${scope}_${dept || "all"}`;
  return getCachedDashboardStatistics(cacheKey, range.from, range.to, scope, dept);
}
