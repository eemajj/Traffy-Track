import { createSupabaseAdminClient } from "@/lib/supabase";
import type { ImportJob, ImportProcessingPhase } from "@/lib/import/types";

export const IMPORT_LEASE_SECONDS = 120;
const IMPORT_BATCH_SELECT = "id, filename, total_rows, processed_rows, duplicate_rows, new_tickets, reopened_tickets, changed_tickets, unchanged_tickets, changed_fields, status, error_message, attempt_count, max_attempts, next_attempt_at, heartbeat_at, imported_at, completed_at, processing_phase";

type ImportBatchRow = {
  id: string;
  filename: string | null;
  total_rows: number | null;
  processed_rows: number | null;
  duplicate_rows: number | null;
  new_tickets: number | null;
  reopened_tickets: number | null;
  changed_tickets: number | null;
  unchanged_tickets: number | null;
  changed_fields: number | null;
  status: "queued" | "running" | "completed" | "failed";
  error_message: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  heartbeat_at: string | null;
  imported_at: string;
  completed_at: string | null;
  processing_phase: ImportProcessingPhase | null;
};

export function mapImportBatchRow(row: ImportBatchRow): ImportJob {
  return {
    filename: row.filename || "import.csv",
    totalRows: row.total_rows || 0,
    processedRows: row.processed_rows || 0,
    duplicateRows: row.duplicate_rows || 0,
    newTickets: row.new_tickets || 0,
    reopenedTickets: row.reopened_tickets || 0,
    changedTickets: row.changed_tickets || 0,
    unchangedTickets: row.unchanged_tickets || 0,
    changedFields: row.changed_fields || 0,
    importBatchId: row.id,
    status: row.status,
    errorMessage: row.error_message,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at,
    heartbeatAt: row.heartbeat_at,
    importedAt: row.imported_at,
    completedAt: row.completed_at,
    processingPhase: row.processing_phase
  };
}

export async function heartbeatImportBatch(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  importBatchId: string,
  leaseToken?: string
) {
  const result = leaseToken
    ? await supabase.rpc("heartbeat_claimed_import_batch", { p_import_batch_id: importBatchId, p_lease_token: leaseToken, p_lease_seconds: IMPORT_LEASE_SECONDS })
    : await supabase.rpc("heartbeat_import_batch", { p_import_batch_id: importBatchId });
  if (result.error || result.data !== true) {
    throw new Error(`งานนำเข้าสูญเสีย heartbeat หรือถูกปิดแล้ว: ${result.error?.message || "สถานะงานไม่ใช่ running"}`);
  }
}

export async function createQueuedImportBatch(input: { filename: string; storagePath?: string }): Promise<ImportJob> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("import_batches").insert({
    filename: input.filename,
    storage_path: null,
    source_storage_path_v2: input.storagePath || null,
    pipeline_version: input.storagePath ? 2 : 1,
    processing_phase: input.storagePath ? "staging" : null,
    total_rows: 0,
    processed_rows: 0,
    duplicate_rows: 0,
    new_tickets: 0,
    reopened_tickets: 0,
    changed_tickets: 0,
    unchanged_tickets: 0,
    changed_fields: 0,
    status: "queued",
    error_message: null,
    completed_at: null
  }).select(IMPORT_BATCH_SELECT).single();

  if (error?.code === "23505") {
    if (input.storagePath) {
      const existingResult = await supabase.from("import_batches").select(IMPORT_BATCH_SELECT).eq("source_storage_path_v2", input.storagePath).maybeSingle();
      if (!existingResult.error && existingResult.data) return mapImportBatchRow(existingResult.data as ImportBatchRow);
    }
    throw new Error("มีงานนำเข้าที่กำลังรอหรือกำลังประมวลผลอยู่ กรุณารอให้งานเดิมเสร็จก่อน");
  }
  if (error || !data) throw new Error(`สร้างรอบนำเข้าไม่สำเร็จ: ${error?.message || "ไม่ทราบสาเหตุ"}`);
  return mapImportBatchRow(data as ImportBatchRow);
}

export async function getImportJob(importBatchId: string): Promise<ImportJob | null> {
  const { data, error } = await createSupabaseAdminClient().from("import_batches").select(IMPORT_BATCH_SELECT).eq("id", importBatchId).maybeSingle();
  if (error) throw new Error(`โหลดสถานะรอบนำเข้าไม่สำเร็จ: ${error.message}`);
  return data ? mapImportBatchRow(data as ImportBatchRow) : null;
}

export async function getRecentImportJobs(limit = 8): Promise<ImportJob[]> {
  const { data, error } = await createSupabaseAdminClient().from("import_batches").select(IMPORT_BATCH_SELECT).order("imported_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`โหลดประวัติรอบนำเข้าไม่สำเร็จ: ${error.message}`);
  return ((data || []) as ImportBatchRow[]).map(mapImportBatchRow);
}

export async function markImportBatchFailed(importBatchId: string, error: unknown) {
  const supabase = createSupabaseAdminClient();
  const result = await supabase.from("import_batches").update({
    status: "failed",
    error_message: error instanceof Error ? error.message : "นำเข้าข้อมูลไม่สำเร็จโดยไม่ทราบสาเหตุ",
    completed_at: new Date().toISOString()
  }).eq("id", importBatchId).in("status", ["queued", "running"]).select("id").maybeSingle();
  if (result.error) throw new Error(`ยืนยันสถานะงานนำเข้าที่ล้มเหลวไม่สำเร็จ: ${result.error.message}`);
  if (!result.data) {
    const statusResult = await supabase.from("import_batches").select("status").eq("id", importBatchId).maybeSingle();
    if (statusResult.error || (statusResult.data?.status !== "completed" && statusResult.data?.status !== "failed")) {
      throw new Error(`ยืนยันสถานะงานนำเข้าที่ล้มเหลวไม่สำเร็จ: ${statusResult.error?.message || "ไม่พบงาน"}`);
    }
  }
}
