import type { SessionRole } from "@/lib/session";

export const REPORT_WORKFLOW_STATUSES = ["draft", "sent", "partially_returned", "complete", "locked"] as const;
export type ReportWorkflowStatus = (typeof REPORT_WORKFLOW_STATUSES)[number];

export type WorkflowActionItem = {
  itemType: "report";
  resourceId: string;
  title: string;
  detail: string;
  workflowStatus: string;
  owner: string | null;
  dueDate: string | null;
  isOverdue: boolean;
  priority: number;
  href: string;
  createdAt: string;
};

type WorkflowActionRow = {
  item_type: "report";
  resource_id: string;
  title: string;
  detail: string;
  workflow_status: string;
  owner: string | null;
  due_date: string | null;
  is_overdue: boolean;
  priority: number;
  href: string;
  created_at: string;
};

export type ReportWorkflowEvent = {
  id: number;
  occurredAt: string;
  actorRole: "admin" | "operator" | "system";
  fromStatus: ReportWorkflowStatus | null;
  toStatus: ReportWorkflowStatus;
  owner: string | null;
  dueDate: string | null;
  nextAction: string | null;
  note: string | null;
};

const NEXT_REPORT_STATUSES: Record<ReportWorkflowStatus, readonly ReportWorkflowStatus[]> = {
  draft: ["sent"],
  sent: ["partially_returned", "complete"],
  partially_returned: ["sent", "complete"],
  complete: ["locked"],
  locked: []
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isReportWorkflowStatus(value: unknown): value is ReportWorkflowStatus {
  return typeof value === "string" && (REPORT_WORKFLOW_STATUSES as readonly string[]).includes(value);
}

export function getAllowedReportTransitions(status: ReportWorkflowStatus, role: SessionRole) {
  return NEXT_REPORT_STATUSES[status].filter((nextStatus) => nextStatus !== "locked" || role === "admin");
}

export function canTransitionReport(status: ReportWorkflowStatus, nextStatus: ReportWorkflowStatus, role: SessionRole) {
  return getAllowedReportTransitions(status, role).includes(nextStatus);
}

export function validateReportWorkflowInput(input: {
  batchId: string;
  owner?: string | null;
  dueDate?: string | null;
  nextAction?: string | null;
}) {
  if (!UUID_PATTERN.test(input.batchId)) throw new Error("รหัสรอบรายงานไม่ถูกต้อง");
  if (input.owner !== undefined && input.owner !== null && input.owner.trim().length > 200) {
    throw new Error("ชื่อเจ้าของรายงานยาวเกิน 200 ตัวอักษร");
  }
  if (input.dueDate && !DATE_PATTERN.test(input.dueDate)) throw new Error("วันที่ติดตามไม่ถูกต้อง");
  if (input.nextAction !== undefined && input.nextAction !== null && input.nextAction.trim().length > 2000) {
    throw new Error("สิ่งที่ต้องทำต่อยาวเกิน 2,000 ตัวอักษร");
  }
}

async function getAdminClient() {
  const [{ hasSupabaseAdminEnv }, { createSupabaseAdminClient }] = await Promise.all([
    import("@/lib/env"),
    import("@/lib/supabase")
  ]);
  if (!hasSupabaseAdminEnv()) throw new Error("ระบบยังไม่ได้ตั้งค่า Supabase");
  return createSupabaseAdminClient();
}

export async function transitionReportWorkflow(input: {
  batchId: string;
  toStatus: ReportWorkflowStatus;
  owner?: string | null;
  dueDate?: string | null;
  nextAction?: string | null;
  note?: string | null;
  actorRole: SessionRole;
}) {
  validateReportWorkflowInput(input);
  const supabase = await getAdminClient();
  const { data, error } = await supabase.rpc("transition_report_batch", {
    p_batch_id: input.batchId, p_to_status: input.toStatus, p_owner: input.owner?.trim() || null,
    p_due_date: input.dueDate || null, p_next_action: input.nextAction?.trim() || null,
    p_note: input.note?.trim() || null, p_actor_role: input.actorRole
  });
  if (error) throw new Error(`เปลี่ยนสถานะรายงานไม่สำเร็จ: ${error.message}`);
  return data as { batchId: string; status: ReportWorkflowStatus; eventId: number };
}

export async function updateReportWorkflowMetadata(input: {
  batchId: string;
  owner: string;
  dueDate?: string | null;
  nextAction?: string | null;
  note?: string | null;
  actorRole: SessionRole;
}) {
  validateReportWorkflowInput(input);
  if (!input.owner.trim()) throw new Error("กรุณาระบุเจ้าของรายงาน");
  const supabase = await getAdminClient();
  const { data, error } = await supabase.rpc("update_report_workflow_metadata", {
    p_batch_id: input.batchId, p_owner: input.owner.trim(), p_due_date: input.dueDate || null,
    p_next_action: input.nextAction?.trim() || null, p_note: input.note?.trim() || null,
    p_actor_role: input.actorRole
  });
  if (error) throw new Error(`บันทึกผู้รับผิดชอบรายงานไม่สำเร็จ: ${error.message}`);
  return data as { batchId: string; status: ReportWorkflowStatus; eventId: number };
}

export async function getReportWorkflowHistory(batchId: string, limit = 100): Promise<ReportWorkflowEvent[]> {
  validateReportWorkflowInput({ batchId });
  const supabase = await getAdminClient();
  const { data, error } = await supabase
    .from("report_workflow_events")
    .select("id, occurred_at, actor_role, from_status, to_status, owner, due_date, next_action, note")
    .eq("report_batch_id", batchId)
    .order("occurred_at", { ascending: false }).order("id", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 250));
  if (error) throw new Error(`โหลดประวัติสถานะรายงานไม่สำเร็จ: ${error.message}`);
  return (data || []).map((row) => ({
    id: Number(row.id), occurredAt: String(row.occurred_at), actorRole: row.actor_role as ReportWorkflowEvent["actorRole"],
    fromStatus: row.from_status as ReportWorkflowStatus | null, toStatus: row.to_status as ReportWorkflowStatus,
    owner: row.owner as string | null, dueDate: row.due_date as string | null,
    nextAction: row.next_action as string | null, note: row.note as string | null
  }));
}

export async function getWorkflowActionCenter(today?: string): Promise<WorkflowActionItem[]> {
  if (today && !DATE_PATTERN.test(today)) throw new Error("วันที่ action center ไม่ถูกต้อง");
  const supabase = await getAdminClient();
  const { data, error } = await supabase.rpc("workflow_action_center", { p_today: today || undefined });
  if (error) throw new Error(`โหลดงานที่ต้องทำไม่สำเร็จ: ${error.message}`);
  return ((data || []) as WorkflowActionRow[]).map((row) => ({
    itemType: "report", resourceId: String(row.resource_id), title: String(row.title),
    detail: String(row.detail), workflowStatus: String(row.workflow_status), owner: row.owner as string | null,
    dueDate: row.due_date as string | null, isOverdue: Boolean(row.is_overdue), priority: Number(row.priority),
    href: String(row.href), createdAt: String(row.created_at)
  }));
}
