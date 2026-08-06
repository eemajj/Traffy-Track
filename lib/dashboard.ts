import { unstable_cache } from "next/cache";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { buildPendingStatesOrFilter, isClosedTicketState } from "@/lib/tickets";
import type { WorkflowActionItem } from "@/lib/workflow";

type LatestImportBatch = {
  id: string;
  imported_at: string;
  filename: string | null;
  total_rows: number;
  new_tickets: number;
  changed_tickets: number;
  unchanged_tickets: number;
};

type DepartmentSummaryRow = {
  dept_name: string;
  pending_count: number;
};

export type UnassignedTicketRow = {
  ticket_id: string;
  state: string | null;
  comment: string | null;
  address: string | null;
  last_activity: string | null;
  org_response: string | null;
  dept_list: string[] | null;
  isExternal?: boolean;
  externalOrgName?: string | null;
};

import {
  getTicketAgeCategory,
  getTicketAgeDays,
  isExternalAgencyOrgResponse,
  type TicketAgeCategory
} from "@/lib/dashboard/statistics";

export { isExternalAgencyOrgResponse, getTicketAgeCategory, getTicketAgeDays };

type TicketRelation = {
  state: string | null;
  comment: string | null;
  address: string | null;
  last_activity: string | null;
  org_response: string | null;
  dept_list: string[] | null;
};

type RecentChangeRow = {
  id: number;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  detected_at: string;
  ticket_id: string;
  tickets: TicketRelation | TicketRelation[] | null;
};

export type RecentTicketChange = {
  ticket_id: string;
  state: string | null;
  comment: string | null;
  address: string | null;
  lastActivity: string | null;
  orgResponse: string | null;
  deptList: string[];
  detectedAt: string;
  changes: Array<{
    id: number;
    field: string;
    label: string;
    oldValue: string | null;
    newValue: string | null;
    detectedAt: string;
  }>;
};

export type EvidenceReadinessDepartment = {
  dept_name: string;
  status: "ready" | "draft" | "missing";
  uploaded_at: string | null;
  version_number: number | null;
};

export type DashboardMetricScope = "district" | "external" | "all";

export type DashboardData =
  | {
      status: "missing_env";
    }
  | {
      status: "unavailable";
      message: string;
    }
  | {
      status: "ready";
      scope: DashboardMetricScope;
      latestBatch: LatestImportBatch | null;
      pendingTicketCount: number;
      unassignedCount: number;
      districtUnassignedCount: number;
      externalAgencyCount: number;
      reopenedTicketCount: number;
      actionableChangeCount: number;
      agingSummary: {
        normal: number;
        warning: number;
        overdue: number;
        critical: number;
      };
      evidenceReadiness: EvidenceReadinessDepartment[];
      departmentSummary: DepartmentSummaryRow[];
      unassignedTickets: UnassignedTicketRow[];
      recentChanges: RecentTicketChange[];
      actionCenter: WorkflowActionItem[];
    };

function normalizeTicketRelation(relation: TicketRelation | TicketRelation[] | null) {
  const ticket = Array.isArray(relation) ? relation[0] : relation;

  if (!ticket) {
    return null;
  }

  return {
    ...ticket,
    dept_list: Array.isArray(ticket.dept_list) ? ticket.dept_list : []
  };
}

function getChangeLabel(field: string) {
  const labels: Record<string, string> = {
    new_ticket: "เรื่องใหม่",
    reopened: "เปิดกลับ",
    state: "สถานะ",
    org_response: "หน่วยงาน",
    star: "คะแนนดาว",
    last_activity: "อัปเดตล่าสุด",
    timestamp: "วันที่รับเรื่อง",
    type: "ประเภท",
    comment: "รายละเอียด",
    photo_url: "รูปภาพ",
    address: "ที่อยู่",
    subdistrict: "แขวง",
    district: "เขต",
    province: "จังหวัด",
    hashtag: "แฮชแท็ก",
    coords: "พิกัด"
  };

  return labels[field] || field;
}

function buildRecentTicketChanges(rows: RecentChangeRow[]) {
  const grouped = new Map<string, RecentTicketChange>();

  for (const row of rows) {
    const ticket = normalizeTicketRelation(row.tickets);
    const current = grouped.get(row.ticket_id);

    if (!current) {
      grouped.set(row.ticket_id, {
        ticket_id: row.ticket_id,
        state: ticket?.state || null,
        comment: ticket?.comment || null,
        address: ticket?.address || null,
        lastActivity: ticket?.last_activity || null,
        orgResponse: ticket?.org_response || null,
        deptList: ticket?.dept_list || [],
        detectedAt: row.detected_at,
        changes: [
          {
            id: row.id,
            field: row.changed_field,
            label: getChangeLabel(row.changed_field),
            oldValue: row.old_value,
            newValue: row.new_value,
            detectedAt: row.detected_at
          }
        ]
      });
      continue;
    }

    if (current.changes.length < 4) {
      current.changes.push({
        id: row.id,
        field: row.changed_field,
        label: getChangeLabel(row.changed_field),
        oldValue: row.old_value,
        newValue: row.new_value,
        detectedAt: row.detected_at
      });
    }
  }

  return Array.from(grouped.values()).slice(0, 8);
}

async function loadDashboardData(scope: DashboardMetricScope = "district"): Promise<DashboardData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const pendingFilter = buildPendingStatesOrFilter();

    const latestBatchResult = await supabase
      .from("import_batches")
      .select("id, imported_at, filename, total_rows, new_tickets, changed_tickets, unchanged_tickets")
      .eq("status", "completed")
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestBatchResult.error) {
      throw new Error(`โหลดรอบนำเข้าล่าสุดไม่สำเร็จ: ${latestBatchResult.error.message}`);
    }

    const latestBatch = (latestBatchResult.data as LatestImportBatch | null) || null;

    const [
      pendingCountResult,
      unassignedCountResult,
      departmentSummaryResult,
      unassignedTicketsResult,
      actionableChangeCountResult,
      reopenedTicketCountResult,
      recentChangesResult,
      actionCenterResult,
      pendingTimestampsResult
    ] = await Promise.all([
      supabase
        .from("tickets")
        .select("ticket_id", { count: "exact", head: true })
        .or(pendingFilter),
      supabase
        .from("tickets")
        .select("ticket_id, org_response")
        .or(pendingFilter)
        .or("dept_list.is.null,dept_list.eq.{}")
        .limit(1000),
      supabase
        .from("tickets")
        .select("dept_list, state")
        .in("state", [
          "รับเรื่อง",
          "กำลังดำเนินการ",
          "ศึกษาปัญหา",
          "ของบประมาณ",
          "จัดซื้อจัดจ้าง",
          "ขั้นตอนทางกฎหมาย",
          "ติดตามเรื่อง"
        ]),
      supabase
        .from("tickets")
        .select("ticket_id, state, comment, address, last_activity, org_response, dept_list")
        .or(pendingFilter)
        .or("dept_list.is.null,dept_list.eq.{}")
        .order("last_activity", { ascending: false, nullsFirst: false })
        .limit(12),
      latestBatch
        ? supabase
            .from("ticket_history")
            .select("id, tickets!inner(state)", { count: "exact", head: true })
            .eq("import_batch_id", latestBatch.id)
            .neq("changed_field", "last_activity")
            .or(pendingFilter, { referencedTable: "tickets" })
        : Promise.resolve({ data: [], error: null, count: 0 }),
      latestBatch
        ? supabase
            .from("ticket_history")
            .select("id, tickets!inner(state)", { count: "exact", head: true })
            .eq("import_batch_id", latestBatch.id)
            .eq("changed_field", "reopened")
            .or(pendingFilter, { referencedTable: "tickets" })
        : Promise.resolve({ data: [], error: null, count: 0 }),
      latestBatch
        ? supabase
            .from("ticket_history")
            .select(
              "id, changed_field, old_value, new_value, detected_at, ticket_id, tickets!inner(state, comment, address, last_activity, org_response, dept_list)"
            )
            .eq("import_batch_id", latestBatch.id)
            .neq("changed_field", "last_activity")
            .or(pendingFilter, { referencedTable: "tickets" })
            .order("detected_at", { ascending: false })
            .limit(120)
        : Promise.resolve({ data: [], error: null }),
      supabase.rpc("workflow_action_center", {}),
      supabase
        .from("tickets")
        .select("timestamp")
        .or(pendingFilter)
        .limit(2000)
    ]);

    if (pendingCountResult.error) {
      throw new Error(`นับจำนวนเรื่องคงค้างไม่สำเร็จ: ${pendingCountResult.error.message}`);
    }

    if (unassignedCountResult.error) {
      throw new Error(`นับจำนวนเรื่องที่ไม่มีฝ่ายใน CityData ไม่สำเร็จ: ${unassignedCountResult.error.message}`);
    }

    if (departmentSummaryResult.error) {
      throw new Error(`โหลดสรุปตามฝ่ายไม่สำเร็จ: ${departmentSummaryResult.error.message}`);
    }

    if (unassignedTicketsResult.error) {
      throw new Error(`โหลดรายการเรื่องที่ไม่มีฝ่ายใน CityData ไม่สำเร็จ: ${unassignedTicketsResult.error.message}`);
    }

    if (actionableChangeCountResult.error) {
      throw new Error(`นับจำนวนรายการเปลี่ยนแปลงสำคัญไม่สำเร็จ: ${actionableChangeCountResult.error.message}`);
    }

    if (reopenedTicketCountResult.error) {
      throw new Error(`นับจำนวนเรื่องเปิดกลับไม่สำเร็จ: ${reopenedTicketCountResult.error.message}`);
    }

    if (recentChangesResult.error) {
      throw new Error(`โหลดรายการเปลี่ยนแปลงล่าสุดไม่สำเร็จ: ${recentChangesResult.error.message}`);
    }

    if (actionCenterResult.error) {
      throw new Error(`โหลดศูนย์งานวันนี้ไม่สำเร็จ: ${actionCenterResult.error.message}`);
    }

    const allUnassignedRows = (unassignedCountResult.data as Array<{ ticket_id: string; org_response: string | null }> | null) || [];
    let districtUnassignedCount = 0;
    let externalAgencyCount = 0;

    for (const row of allUnassignedRows) {
      const { isExternal } = isExternalAgencyOrgResponse(row.org_response);
      if (isExternal) {
        externalAgencyCount++;
      } else {
        districtUnassignedCount++;
      }
    }

    const rawUnassignedTickets = (unassignedTicketsResult.data as UnassignedTicketRow[] | null) || [];
    const unassignedTickets = rawUnassignedTickets.map((ticket) => {
      const { isExternal, externalOrgName } = isExternalAgencyOrgResponse(ticket.org_response);
      return {
        ...ticket,
        isExternal,
        externalOrgName
      };
    });

    const recentRows = ((recentChangesResult.data as RecentChangeRow[] | null) || []).filter((change) => {
      const ticket = normalizeTicketRelation(change.tickets);
      return !ticket || !isClosedTicketState(ticket.state);
    });

    const pendingTimestamps = (pendingTimestampsResult.data as Array<{ timestamp: string | null }> | null) || [];
    const agingSummary: Record<TicketAgeCategory, number> = { normal: 0, warning: 0, overdue: 0, critical: 0 };
    const now = new Date();

    for (const row of pendingTimestamps) {
      const ageDays = getTicketAgeDays(row.timestamp, now);
      const cat = getTicketAgeCategory(ageDays);
      agingSummary[cat]++;
    }

    let evidenceReadiness: EvidenceReadinessDepartment[] = [];
    if (latestBatch) {
      const depsResult = await supabase
        .from("report_batch_departments")
        .select("dept_name, evidence_file_url, evidence_review_status, evidence_uploaded_at, evidence_version_number")
        .eq("report_batch_id", latestBatch.id)
        .order("dept_name", { ascending: true });

      if (!depsResult.error && depsResult.data) {
        evidenceReadiness = depsResult.data.map((row) => {
          let status: "ready" | "draft" | "missing" = "missing";
          if (row.evidence_review_status === "approved" || row.evidence_file_url) {
            status = "ready";
          } else if (row.evidence_review_status === "submitted" || row.evidence_review_status === "draft") {
            status = "draft";
          }
          return {
            dept_name: row.dept_name,
            status,
            uploaded_at: row.evidence_uploaded_at || null,
            version_number: row.evidence_version_number || null
          };
        });
      }
    }

    const rawDeptRows = (departmentSummaryResult.data as Array<{ dept_list: string[] | null; state: string }> | null) || [];
    const deptCountMap = new Map<string, number>();

    for (const row of rawDeptRows) {
      const depts = (row.dept_list || []).filter((d) => d.includes("ทวีวัฒนา"));
      if (depts.length > 0) {
        const primaryDept = depts[depts.length - 1];
        deptCountMap.set(primaryDept, (deptCountMap.get(primaryDept) || 0) + 1);
      }
    }

    const calculatedDepartmentSummary: DepartmentSummaryRow[] = Array.from(deptCountMap.entries())
      .map(([dept_name, pending_count]) => ({ dept_name, pending_count }))
      .sort((a, b) => b.pending_count - a.pending_count);

    return {
      status: "ready",
      scope,
      latestBatch,
      pendingTicketCount: pendingCountResult.count || 0,
      unassignedCount: allUnassignedRows.length,
      districtUnassignedCount,
      externalAgencyCount,
      reopenedTicketCount: reopenedTicketCountResult.count || 0,
      actionableChangeCount: actionableChangeCountResult.count || 0,
      agingSummary,
      evidenceReadiness,
      departmentSummary: calculatedDepartmentSummary,
      unassignedTickets,
      recentChanges: buildRecentTicketChanges(recentRows),
      actionCenter: ((actionCenterResult.data || []) as Array<{
        item_type: "report"; resource_id: string; title: string; detail: string;
        workflow_status: string; owner: string | null; due_date: string | null; is_overdue: boolean;
        priority: number; href: string; created_at: string;
      }>).map((row) => ({
        itemType: row.item_type,
        resourceId: row.resource_id,
        title: row.title,
        detail: row.detail,
        workflowStatus: row.workflow_status,
        owner: row.owner,
        dueDate: row.due_date,
        isOverdue: row.is_overdue,
        priority: row.priority,
        href: row.href,
        createdAt: row.created_at
      }))
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "ข้อมูลภาพรวมระบบยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export const DASHBOARD_CACHE_TAG = "dashboard-data";

const getCachedDashboardData = unstable_cache(
  async (scope: DashboardMetricScope) => loadDashboardData(scope),
  [DASHBOARD_CACHE_TAG],
  { revalidate: 15, tags: [DASHBOARD_CACHE_TAG] }
);

export async function getDashboardData(scope: DashboardMetricScope = "district"): Promise<DashboardData> {
  return getCachedDashboardData(scope);
}
