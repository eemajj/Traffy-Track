import Papa from "papaparse";

import { applyImportBatchTransaction, type ImportApplyInput } from "@/lib/import/apply-service";
import { dedupeTicketsById } from "@/lib/import/dedupe";
import { getTicketFieldChanges, preserveMissingOptionalFields, validateCsvRows } from "@/lib/import/integrity";
import {
  createQueuedImportBatch,
  getImportJob,
  getRecentImportJobs,
  heartbeatImportBatch,
  markImportBatchFailed
} from "@/lib/import/job-service";
import { normalizeCsvRow, normalizeTicket, validateCsvColumns } from "@/lib/import/normalize";
import { deleteImportSourceIfTerminal, downloadImportSource, removeImportSourceWhenTerminal } from "@/lib/import/storage-service";
import type { ExistingTicketSnapshot, ImportSummary, TicketHistoryInsert, TicketRecord } from "@/lib/import/types";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { isClosedTicketState } from "@/lib/tickets";

const SELECT_CHUNK_SIZE = 500;
const SELECT_CHUNK_CONCURRENCY = 4;
const IMPORT_HEARTBEAT_ROW_INTERVAL = 5_000;

export { createQueuedImportBatch, deleteImportSourceIfTerminal, getImportJob, getRecentImportJobs };

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function stringifyValue(value: string | number | null) {
  return value === null || value === undefined ? null : String(value);
}

async function heartbeat(importBatchId: string, leaseToken?: string) {
  await heartbeatImportBatch(createSupabaseAdminClient(), importBatchId, leaseToken);
}

export async function processImportCsv(file: File): Promise<ImportSummary> {
  return processImportCsvText(await file.text(), file.name || "import.csv");
}

export async function processImportCsvFromStorage(input: {
  path: string;
  filename: string;
  importBatchId?: string;
  leaseToken?: string;
  apply?: (input: ImportApplyInput) => Promise<void>;
}): Promise<ImportSummary> {
  try {
    return await processImportCsvText(await downloadImportSource(input.path), input.filename, {
      importBatchId: input.importBatchId,
      leaseToken: input.leaseToken,
      apply: input.apply
    });
  } catch (error) {
    if (input.importBatchId && !input.leaseToken) await markImportBatchFailed(input.importBatchId, error);
    throw error;
  } finally {
    if (input.importBatchId) await removeImportSourceWhenTerminal({ path: input.path, importBatchId: input.importBatchId });
  }
}

export async function processImportCsvText(
  text: string,
  filename: string,
  options?: {
    importBatchId?: string;
    leaseToken?: string;
    apply?: (input: ImportApplyInput) => Promise<void>;
  }
): Promise<ImportSummary> {
  const supabase = createSupabaseAdminClient();
  let importBatchId = options?.importBatchId || "";

  try {
    if (importBatchId && options?.leaseToken) {
      await heartbeat(importBatchId, options.leaseToken);
    } else if (importBatchId) {
      const { data, error } = await supabase.from("import_batches").update({
        status: "running",
        error_message: null,
        completed_at: null,
        heartbeat_at: new Date().toISOString()
      }).eq("id", importBatchId).eq("status", "queued").select("id").maybeSingle();
      if (error) throw new Error(`อัปเดตสถานะรอบนำเข้าไม่สำเร็จ: ${error.message}`);
      if (!data) throw new Error("งานนำเข้านี้ไม่อยู่ในสถานะรอประมวลผลแล้ว");
    } else {
      const queuedBatch = await createQueuedImportBatch({ filename });
      importBatchId = queuedBatch.importBatchId;
      const { error } = await supabase.from("import_batches").update({ status: "running", heartbeat_at: new Date().toISOString() }).eq("id", importBatchId);
      if (error) throw new Error(`อัปเดตสถานะรอบนำเข้าไม่สำเร็จ: ${error.message}`);
    }

    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy" });
    if (parsed.errors.length > 0) {
      const firstError = parsed.errors[0];
      throw new Error(`CSV parse error at row ${firstError.row}: ${firstError.message}`);
    }

    const columnMap = validateCsvColumns(parsed.meta.fields || []);
    const normalizedRows = parsed.data.map((row) => normalizeCsvRow(row, columnMap));
    if (normalizedRows.length === 0) throw new Error("CSV does not contain any valid rows");
    validateCsvRows(normalizedRows);
    await heartbeat(importBatchId, options?.leaseToken);

    const normalizedTicketRecords = normalizedRows.map((row) => normalizeTicket(row));
    const { ticketRecords, duplicateRows } = dedupeTicketsById(normalizedTicketRecords);
    const uniqueTicketIds = [...new Set(ticketRecords.map((row) => row.ticket_id))];
    const existingTicketMap = new Map<string, ExistingTicketSnapshot>();

    const ticketIdChunks = chunkArray(uniqueTicketIds, SELECT_CHUNK_SIZE);
    for (const chunkGroup of chunkArray(ticketIdChunks, SELECT_CHUNK_CONCURRENCY)) {
      const results = await Promise.all(chunkGroup.map((ticketIdChunk) => supabase.from("tickets").select(
        "ticket_id, type, comment, photo_url, address, subdistrict, district, province, timestamp, last_activity, state, org_response, org_list, dept_list, star, hashtag, lat, lng"
      ).in("ticket_id", ticketIdChunk)));
      for (const result of results) {
        if (result.error) throw new Error(`โหลดข้อมูลเรื่องเดิมไม่สำเร็จ: ${result.error.message}`);
        for (const row of (result.data || []) as ExistingTicketSnapshot[]) existingTicketMap.set(row.ticket_id, row);
      }
      await heartbeat(importBatchId, options?.leaseToken);
    }

    let newTickets = 0;
    let reopenedTickets = 0;
    let changedTickets = 0;
    let unchangedTickets = 0;
    let changedFields = 0;
    const upsertRows: TicketRecord[] = [];
    const historyRows: TicketHistoryInsert[] = [];

    for (let ticketIndex = 0; ticketIndex < ticketRecords.length; ticketIndex += 1) {
      const sourceTicket = ticketRecords[ticketIndex];
      if (ticketIndex > 0 && ticketIndex % IMPORT_HEARTBEAT_ROW_INTERVAL === 0) await heartbeat(importBatchId, options?.leaseToken);
      let ticket = sourceTicket;
      const existing = existingTicketMap.get(ticket.ticket_id);

      if (!existing) {
        newTickets += 1;
        upsertRows.push(ticket);
        historyRows.push({ ticket_id: ticket.ticket_id, changed_field: "new_ticket", old_value: null, new_value: stringifyValue(ticket.state), import_batch_id: importBatchId });
        continue;
      }

      ticket = preserveMissingOptionalFields(ticket, existing, columnMap);
      const fieldChanges = getTicketFieldChanges(existing, ticket);
      const isReopenedTicket = isClosedTicketState(existing.state || null) && Boolean(ticket.state) && !isClosedTicketState(ticket.state);
      if (fieldChanges.length === 0) {
        unchangedTickets += 1;
        continue;
      }

      changedTickets += 1;
      changedFields += fieldChanges.length;
      upsertRows.push(ticket);
      for (const change of fieldChanges) {
        historyRows.push({ ticket_id: ticket.ticket_id, changed_field: change.changed_field, old_value: change.old_value, new_value: change.new_value, import_batch_id: importBatchId });
      }
      if (isReopenedTicket) {
        reopenedTickets += 1;
        changedFields += 1;
        historyRows.push({ ticket_id: ticket.ticket_id, changed_field: "reopened", old_value: stringifyValue(existing.state), new_value: stringifyValue(ticket.state), import_batch_id: importBatchId });
      }
    }

    await heartbeat(importBatchId, options?.leaseToken);
    await (options?.apply || applyImportBatchTransaction)({
      importBatchId,
      leaseToken: options?.leaseToken,
      tickets: upsertRows,
      history: historyRows,
      totalRows: normalizedTicketRecords.length,
      processedRows: ticketRecords.length,
      duplicateRows,
      newTickets,
      reopenedTickets,
      changedTickets,
      unchangedTickets,
      changedFields
    });

    return { filename, totalRows: normalizedTicketRecords.length, processedRows: ticketRecords.length, duplicateRows, newTickets, reopenedTickets, changedTickets, unchangedTickets, changedFields, importBatchId };
  } catch (error) {
    if (importBatchId && !options?.leaseToken) await markImportBatchFailed(importBatchId, error);
    throw error;
  }
}
