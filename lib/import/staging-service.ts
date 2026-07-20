import type { ImportApplyInput } from "@/lib/import/apply-service";
import { IMPORT_LEASE_SECONDS } from "@/lib/import/job-service";
import { createSupabaseAdminClient } from "@/lib/supabase";

const STAGE_TICKET_CHUNK_SIZE = 750;
const STAGE_HISTORY_CHUNK_SIZE = 1_500;

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function rpcError(prefix: string, error?: { message?: string } | null) {
  return new Error(`${prefix}: ${error?.message || "ไม่ทราบสาเหตุ"}`);
}

export async function stageImportBatchTransaction(input: ImportApplyInput & { leaseToken: string }) {
  const supabase = createSupabaseAdminClient();
  const reset = await supabase.rpc("reset_claimed_import_stage_v2", {
    p_import_batch_id: input.importBatchId,
    p_lease_token: input.leaseToken,
    p_lease_seconds: IMPORT_LEASE_SECONDS
  });
  if (reset.error) throw rpcError("ล้างพื้นที่พักของงานนำเข้าไม่สำเร็จ", reset.error);

  const ticketChunks = chunkArray(input.tickets, STAGE_TICKET_CHUNK_SIZE);
  const historyChunks = chunkArray(input.history, STAGE_HISTORY_CHUNK_SIZE);
  const chunkCount = Math.max(ticketChunks.length, historyChunks.length, 1);

  for (let index = 0; index < chunkCount; index += 1) {
    const staged = await supabase.rpc("stage_claimed_import_rows_v2", {
      p_import_batch_id: input.importBatchId,
      p_lease_token: input.leaseToken,
      p_tickets: ticketChunks[index] || [],
      p_history: (historyChunks[index] || []).map((row) => ({
        ticket_id: row.ticket_id,
        changed_field: row.changed_field,
        old_value: row.old_value,
        new_value: row.new_value
      })),
      p_lease_seconds: IMPORT_LEASE_SECONDS
    });
    if (staged.error) throw rpcError(`พักข้อมูลนำเข้าชุดที่ ${index + 1} ไม่สำเร็จ`, staged.error);
  }

  const continued = await supabase.rpc("continue_claimed_import_batch_v2", {
    p_import_batch_id: input.importBatchId,
    p_lease_token: input.leaseToken,
    p_total_rows: input.totalRows,
    p_processed_rows: input.processedRows,
    p_duplicate_rows: input.duplicateRows,
    p_new_tickets: input.newTickets,
    p_reopened_tickets: input.reopenedTickets,
    p_changed_tickets: input.changedTickets,
    p_unchanged_tickets: input.unchangedTickets,
    p_changed_fields: input.changedFields,
    p_expected_tickets: input.tickets.length,
    p_expected_history: input.history.length
  });
  if (continued.error) throw rpcError("ส่งงานนำเข้าเข้าสู่ขั้นบันทึกสุดท้ายไม่สำเร็จ", continued.error);
}

export async function finalizeStagedImportBatch(input: { importBatchId: string; leaseToken: string }) {
  const result = await createSupabaseAdminClient().rpc("finalize_staged_import_batch_v2", {
    p_import_batch_id: input.importBatchId,
    p_lease_token: input.leaseToken
  });
  if (result.error) throw rpcError("บันทึกข้อมูลนำเข้าจากพื้นที่พักไม่สำเร็จ", result.error);
}
