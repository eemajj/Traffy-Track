import { createSupabaseAdminClient } from "@/lib/supabase";
import type { TicketHistoryInsert, TicketRecord } from "@/lib/import/types";

export type ImportApplyInput = {
  importBatchId: string;
  leaseToken?: string;
  tickets: TicketRecord[];
  history: TicketHistoryInsert[];
  totalRows: number;
  processedRows: number;
  duplicateRows: number;
  newTickets: number;
  reopenedTickets: number;
  changedTickets: number;
  unchangedTickets: number;
  changedFields: number;
};

export async function applyImportBatchTransaction(input: ImportApplyInput) {
  const supabase = createSupabaseAdminClient();
  const applyInput = {
    p_import_batch_id: input.importBatchId,
    p_tickets: input.tickets,
    p_history: input.history,
    p_total_rows: input.totalRows,
    p_processed_rows: input.processedRows,
    p_duplicate_rows: input.duplicateRows,
    p_new_tickets: input.newTickets,
    p_reopened_tickets: input.reopenedTickets,
    p_changed_tickets: input.changedTickets,
    p_unchanged_tickets: input.unchangedTickets,
    p_changed_fields: input.changedFields
  };
  const { error } = input.leaseToken
    ? await supabase.rpc("apply_claimed_import_batch", { ...applyInput, p_lease_token: input.leaseToken })
    : await supabase.rpc("apply_import_batch", applyInput);
  if (error) throw new Error(`บันทึกข้อมูลนำเข้าแบบ transaction ไม่สำเร็จ: ${error.message}`);
}
