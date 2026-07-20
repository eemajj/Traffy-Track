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

type UnassignedTicketRow = {
  ticket_id: string;
  state: string | null;
  comment: string | null;
  address: string | null;
  last_activity: string | null;
  org_response: string | null;
  dept_list: string[] | null;
};

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
      latestBatch: LatestImportBatch | null;
      pendingTicketCount: number;
      unassignedCount: number;
      reopenedTicketCount: number;
      actionableChangeCount: number;
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

async function loadDashboardData(): Promise<DashboardData> {
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
      actionCenterResult
    ] = await Promise.all([
      supabase
        .from("tickets")
        .select("ticket_id", { count: "exact", head: true })
        .or(pendingFilter),
      supabase
        .from("tickets")
        .select("ticket_id", { count: "exact", head: true })
        .or(pendingFilter)
        .or("dept_list.is.null,dept_list.eq.{}"),
      supabase.rpc("dashboard_pending_by_department"),
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
      supabase.rpc("workflow_action_center", {})
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

    const recentRows = ((recentChangesResult.data as RecentChangeRow[] | null) || []).filter((change) => {
      const ticket = normalizeTicketRelation(change.tickets);
      return !ticket || !isClosedTicketState(ticket.state);
    });

    return {
      status: "ready",
      latestBatch,
      pendingTicketCount: pendingCountResult.count || 0,
      unassignedCount: unassignedCountResult.count || 0,
      reopenedTicketCount: reopenedTicketCountResult.count || 0,
      actionableChangeCount: actionableChangeCountResult.count || 0,
      departmentSummary: (departmentSummaryResult.data as DepartmentSummaryRow[] | null) || [],
      unassignedTickets: (unassignedTicketsResult.data as UnassignedTicketRow[] | null) || [],
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

// A short shared cache absorbs bursts (for example, everyone opening the
// dashboard during a presentation) while keeping operational data near-real-time.
const getCachedDashboardData = unstable_cache(
  loadDashboardData,
  [DASHBOARD_CACHE_TAG],
  { revalidate: 15, tags: [DASHBOARD_CACHE_TAG] }
);

export async function getDashboardData(): Promise<DashboardData> {
  return getCachedDashboardData();
}
