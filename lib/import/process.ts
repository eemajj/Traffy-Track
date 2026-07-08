import Papa from "papaparse";

import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  ExistingTicketSnapshot,
  ImportSummary,
  TicketHistoryInsert,
  TicketRecord
} from "@/lib/import/types";
import { normalizeCsvRow, normalizeTicket, validateCsvColumns } from "@/lib/import/normalize";
import { IMPORT_BUCKET } from "@/lib/storage";
import { isClosedTicketState } from "@/lib/tickets";

const UPSERT_CHUNK_SIZE = 500;
const SELECT_CHUNK_SIZE = 500;
const HISTORY_CHUNK_SIZE = 1000;

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function stringifyValue(value: string | number | null) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function areTimestampValuesEqual(left: string | null, right: string | null) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return left === right;
  }

  return leftTime === rightTime;
}

function dedupeTicketsById(ticketRecords: TicketRecord[]) {
  const dedupedMap = new Map<string, TicketRecord>();
  let duplicateRows = 0;

  for (const ticket of ticketRecords) {
    if (dedupedMap.has(ticket.ticket_id)) {
      duplicateRows += 1;
    }

    dedupedMap.set(ticket.ticket_id, ticket);
  }

  return {
    ticketRecords: [...dedupedMap.values()],
    duplicateRows
  };
}

export async function processImportCsv(file: File): Promise<ImportSummary> {
  const filename = file.name || "import.csv";
  const text = await file.text();
  return processImportCsvText(text, filename);
}

export async function processImportCsvFromStorage(input: {
  path: string;
  filename: string;
}): Promise<ImportSummary> {
  const supabase = createSupabaseAdminClient();
  const downloadResult = await supabase.storage.from(IMPORT_BUCKET).download(input.path);

  if (downloadResult.error || !downloadResult.data) {
    throw new Error(`โหลดไฟล์นำเข้าจากพื้นที่เก็บไฟล์ไม่สำเร็จ: ${downloadResult.error?.message || "ไม่พบไฟล์"}`);
  }

  try {
    const text = await downloadResult.data.text();
    return await processImportCsvText(text, input.filename);
  } finally {
    await supabase.storage.from(IMPORT_BUCKET).remove([input.path]);
  }
}

export async function processImportCsvText(text: string, filename: string): Promise<ImportSummary> {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy"
  });

  const blockingParseErrors = parsed.errors.filter((error) => {
    const errorType = (error as { type?: string }).type;
    return errorType !== "FieldMismatch";
  });

  if (blockingParseErrors.length > 0) {
    const firstError = blockingParseErrors[0];
    throw new Error(`CSV parse error at row ${firstError.row}: ${firstError.message}`);
  }

  if (parsed.errors.length > 0) {
    console.warn("CSV import continued with row-level field mismatches", {
      filename,
      mismatchCount: parsed.errors.length,
      firstMismatch: parsed.errors[0]
    });
  }

  const columnMap = validateCsvColumns(parsed.meta.fields || []);

  const normalizedRows = parsed.data
    .map((row: Record<string, string>) => normalizeCsvRow(row, columnMap))
    .filter((row) => row.ticket_id.trim().length > 0);

  if (normalizedRows.length === 0) {
    throw new Error("CSV does not contain any valid rows");
  }

  const normalizedTicketRecords = normalizedRows.map((row) => normalizeTicket(row));
  const {
    ticketRecords,
    duplicateRows
  } = dedupeTicketsById(normalizedTicketRecords);
  const uniqueTicketIds = [...new Set(ticketRecords.map((row) => row.ticket_id))];
  const supabase = createSupabaseAdminClient();

  const { data: createdBatch, error: createBatchError } = await supabase
    .from("import_batches")
    .insert({
      filename,
      total_rows: normalizedTicketRecords.length,
      new_tickets: 0,
      changed_tickets: 0,
      unchanged_tickets: 0,
      status: "running",
      error_message: null,
      completed_at: null
    })
    .select("id")
    .single();

  if (createBatchError || !createdBatch) {
    throw new Error(`สร้างรอบนำเข้าไม่สำเร็จ: ${createBatchError?.message || "ไม่ทราบสาเหตุ"}`);
  }

  const importBatchId = createdBatch.id as string;

  try {

    const existingTicketMap = new Map<string, ExistingTicketSnapshot>();

    for (const ticketIdChunk of chunkArray(uniqueTicketIds, SELECT_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from("tickets")
        .select("ticket_id, state, org_response, last_activity, star")
        .in("ticket_id", ticketIdChunk);

      if (error) {
        throw new Error(`โหลดข้อมูลเรื่องเดิมไม่สำเร็จ: ${error.message}`);
      }

      for (const row of (data || []) as ExistingTicketSnapshot[]) {
        existingTicketMap.set(row.ticket_id, row);
      }
    }

    let newTickets = 0;
    let reopenedTickets = 0;
    let changedTickets = 0;
    let unchangedTickets = 0;
    let changedFields = 0;

    const upsertRows: TicketRecord[] = [];
    const historyRows: TicketHistoryInsert[] = [];

    for (const ticket of ticketRecords) {
      const existing = existingTicketMap.get(ticket.ticket_id);

      if (!existing) {
        newTickets += 1;
        upsertRows.push(ticket);
        historyRows.push({
          ticket_id: ticket.ticket_id,
          changed_field: "new_ticket",
          old_value: null,
          new_value: stringifyValue(ticket.state),
          import_batch_id: importBatchId
        });
        continue;
      }

      const fieldChanges: Array<{
        changed_field: "state" | "org_response" | "last_activity" | "star";
        old_value: string | null;
        new_value: string | null;
      }> = [];

      if ((existing.state || null) !== ticket.state) {
        fieldChanges.push({
          changed_field: "state",
          old_value: stringifyValue(existing.state),
          new_value: stringifyValue(ticket.state)
        });
      }

      const isReopenedTicket = isClosedTicketState(existing.state || null) && Boolean(ticket.state) && !isClosedTicketState(ticket.state);

      if ((existing.org_response || null) !== ticket.org_response) {
        fieldChanges.push({
          changed_field: "org_response",
          old_value: stringifyValue(existing.org_response),
          new_value: stringifyValue(ticket.org_response)
        });
      }

      if (!areTimestampValuesEqual(existing.last_activity || null, ticket.last_activity)) {
        fieldChanges.push({
          changed_field: "last_activity",
          old_value: stringifyValue(existing.last_activity),
          new_value: stringifyValue(ticket.last_activity)
        });
      }

      if ((existing.star ?? null) !== ticket.star) {
        fieldChanges.push({
          changed_field: "star",
          old_value: stringifyValue(existing.star),
          new_value: stringifyValue(ticket.star)
        });
      }

      if (fieldChanges.length === 0) {
        unchangedTickets += 1;
        continue;
      }

      changedTickets += 1;
      changedFields += fieldChanges.length;
      upsertRows.push(ticket);

      for (const change of fieldChanges) {
        historyRows.push({
          ticket_id: ticket.ticket_id,
          changed_field: change.changed_field,
          old_value: change.old_value,
          new_value: change.new_value,
          import_batch_id: importBatchId
        });
      }

      if (isReopenedTicket) {
        reopenedTickets += 1;
        changedFields += 1;
        historyRows.push({
          ticket_id: ticket.ticket_id,
          changed_field: "reopened",
          old_value: stringifyValue(existing.state),
          new_value: stringifyValue(ticket.state),
          import_batch_id: importBatchId
        });
      }
    }

    for (const upsertChunk of chunkArray(upsertRows, UPSERT_CHUNK_SIZE)) {
      const { error } = await supabase.from("tickets").upsert(upsertChunk, {
        onConflict: "ticket_id"
      });

      if (error) {
        throw new Error(`บันทึกข้อมูลเรื่องไม่สำเร็จ: ${error.message}`);
      }
    }

    for (const historyChunk of chunkArray(historyRows, HISTORY_CHUNK_SIZE)) {
      const { error } = await supabase.from("ticket_history").insert(historyChunk);

      if (error) {
        throw new Error(`บันทึกประวัติเรื่องไม่สำเร็จ: ${error.message}`);
      }
    }

    const { error: updateBatchError } = await supabase
      .from("import_batches")
      .update({
        new_tickets: newTickets,
        changed_tickets: changedTickets,
        unchanged_tickets: unchangedTickets,
        status: "completed",
        error_message: null,
        completed_at: new Date().toISOString()
      })
      .eq("id", importBatchId);

    if (updateBatchError) {
      throw new Error(`อัปเดตสรุปรอบนำเข้าไม่สำเร็จ: ${updateBatchError.message}`);
    }

    return {
      filename,
      totalRows: normalizedTicketRecords.length,
      processedRows: ticketRecords.length,
      duplicateRows,
      newTickets,
      reopenedTickets,
      changedTickets,
      unchangedTickets,
      changedFields,
      importBatchId
    };
  } catch (error) {
    await supabase
      .from("import_batches")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "นำเข้าข้อมูลไม่สำเร็จโดยไม่ทราบสาเหตุ",
        completed_at: new Date().toISOString()
      })
      .eq("id", importBatchId);

    throw error;
  }
}
