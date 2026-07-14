import Papa from "papaparse";

import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  ExistingTicketSnapshot,
  ImportJob,
  ImportSummary,
  TicketHistoryInsert,
  TicketRecord
} from "@/lib/import/types";
import { normalizeCsvRow, normalizeTicket, validateCsvColumns } from "@/lib/import/normalize";
import {
  getTicketFieldChanges,
  preserveMissingOptionalFields,
  validateCsvRows
} from "@/lib/import/integrity";
import { dedupeTicketsById } from "@/lib/import/dedupe";
import { IMPORT_BUCKET } from "@/lib/storage";
import { isClosedTicketState } from "@/lib/tickets";

const SELECT_CHUNK_SIZE = 500;
const IMPORT_HEARTBEAT_ROW_INTERVAL = 5_000;

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
  imported_at: string;
  completed_at: string | null;
};

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

function mapImportBatchRow(row: ImportBatchRow): ImportJob {
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
    importedAt: row.imported_at,
    completedAt: row.completed_at
  };
}

async function heartbeatImportBatch(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  importBatchId: string
) {
  const result = await supabase.rpc("heartbeat_import_batch", {
    p_import_batch_id: importBatchId
  });

  if (result.error || result.data !== true) {
    throw new Error(
      `งานนำเข้าสูญเสีย heartbeat หรือถูกปิดแล้ว: ${result.error?.message || "สถานะงานไม่ใช่ running"}`
    );
  }
}

export async function createQueuedImportBatch(input: {
  filename: string;
}): Promise<ImportJob> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      filename: input.filename,
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
    })
    .select(
      "id, filename, total_rows, processed_rows, duplicate_rows, new_tickets, reopened_tickets, changed_tickets, unchanged_tickets, changed_fields, status, error_message, imported_at, completed_at"
    )
    .single();

  if (error?.code === "23505") {
    throw new Error("มีงานนำเข้าที่กำลังรอหรือกำลังประมวลผลอยู่ กรุณารอให้งานเดิมเสร็จก่อน");
  }

  if (error || !data) {
    throw new Error(`สร้างรอบนำเข้าไม่สำเร็จ: ${error?.message || "ไม่ทราบสาเหตุ"}`);
  }

  return mapImportBatchRow(data as ImportBatchRow);
}

export async function getImportJob(importBatchId: string): Promise<ImportJob | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select(
      "id, filename, total_rows, processed_rows, duplicate_rows, new_tickets, reopened_tickets, changed_tickets, unchanged_tickets, changed_fields, status, error_message, imported_at, completed_at"
    )
    .eq("id", importBatchId)
    .maybeSingle();

  if (error) {
    throw new Error(`โหลดสถานะรอบนำเข้าไม่สำเร็จ: ${error.message}`);
  }

  return data ? mapImportBatchRow(data as ImportBatchRow) : null;
}

export async function getRecentImportJobs(limit = 8): Promise<ImportJob[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select(
      "id, filename, total_rows, processed_rows, duplicate_rows, new_tickets, reopened_tickets, changed_tickets, unchanged_tickets, changed_fields, status, error_message, imported_at, completed_at"
    )
    .order("imported_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`โหลดประวัติรอบนำเข้าไม่สำเร็จ: ${error.message}`);
  }

  return ((data || []) as ImportBatchRow[]).map(mapImportBatchRow);
}

async function markImportBatchFailed(importBatchId: string, error: unknown) {
  const supabase = createSupabaseAdminClient();

  const result = await supabase
    .from("import_batches")
    .update({
      status: "failed",
      error_message: error instanceof Error ? error.message : "นำเข้าข้อมูลไม่สำเร็จโดยไม่ทราบสาเหตุ",
      completed_at: new Date().toISOString()
    })
    .eq("id", importBatchId)
    .in("status", ["queued", "running"])
    .select("id")
    .maybeSingle();

  if (result.error) {
    throw new Error(`ยืนยันสถานะงานนำเข้าที่ล้มเหลวไม่สำเร็จ: ${result.error.message}`);
  }
  if (!result.data) {
    const statusResult = await supabase
      .from("import_batches")
      .select("status")
      .eq("id", importBatchId)
      .maybeSingle();
    if (
      statusResult.error
      || (statusResult.data?.status !== "completed" && statusResult.data?.status !== "failed")
    ) {
      throw new Error(`ยืนยันสถานะงานนำเข้าที่ล้มเหลวไม่สำเร็จ: ${statusResult.error?.message || "ไม่พบงาน"}`);
    }
  }
}

export async function processImportCsv(file: File): Promise<ImportSummary> {
  const filename = file.name || "import.csv";
  const text = await file.text();
  return processImportCsvText(text, filename);
}

export async function processImportCsvFromStorage(input: {
  path: string;
  filename: string;
  importBatchId?: string;
}): Promise<ImportSummary> {
  const supabase = createSupabaseAdminClient();

  try {
    const downloadResult = await supabase.storage.from(IMPORT_BUCKET).download(input.path);

    if (downloadResult.error || !downloadResult.data) {
      throw new Error(`โหลดไฟล์นำเข้าจากพื้นที่เก็บไฟล์ไม่สำเร็จ: ${downloadResult.error?.message || "ไม่พบไฟล์"}`);
    }

    const text = await downloadResult.data.text();
    return await processImportCsvText(text, input.filename, {
      importBatchId: input.importBatchId
    });
  } catch (error) {
    if (input.importBatchId) {
      await markImportBatchFailed(input.importBatchId, error);
    }

    throw error;
  } finally {
    // Keep the source whenever the database cannot prove the job reached a
    // terminal state. This leaves stale recovery/retry with the original CSV.
    if (input.importBatchId) {
      const statusResult = await supabase
        .from("import_batches")
        .select("status")
        .eq("id", input.importBatchId)
        .maybeSingle();
      if (
        !statusResult.error
        && (statusResult.data?.status === "completed" || statusResult.data?.status === "failed")
      ) {
        await supabase.storage.from(IMPORT_BUCKET).remove([input.path]);
      }
    }
  }
}

export async function processImportCsvText(
  text: string,
  filename: string,
  options?: {
    importBatchId?: string;
  }
): Promise<ImportSummary> {
  const supabase = createSupabaseAdminClient();
  let importBatchId = options?.importBatchId || "";

  try {
    if (importBatchId) {
      const { data, error } = await supabase
        .from("import_batches")
        .update({
          status: "running",
          error_message: null,
          completed_at: null,
          heartbeat_at: new Date().toISOString()
        })
        .eq("id", importBatchId)
        .eq("status", "queued")
        .select("id")
        .maybeSingle();

      if (error) {
        throw new Error(`อัปเดตสถานะรอบนำเข้าไม่สำเร็จ: ${error.message}`);
      }
      if (!data) {
        throw new Error("งานนำเข้านี้ไม่อยู่ในสถานะรอประมวลผลแล้ว");
      }
    } else {
      const queuedBatch = await createQueuedImportBatch({ filename });
      importBatchId = queuedBatch.importBatchId;
      const { error } = await supabase
        .from("import_batches")
        .update({
          status: "running",
          heartbeat_at: new Date().toISOString()
        })
        .eq("id", importBatchId);

      if (error) {
        throw new Error(`อัปเดตสถานะรอบนำเข้าไม่สำเร็จ: ${error.message}`);
      }
    }

    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: "greedy"
    });

    if (parsed.errors.length > 0) {
      const firstError = parsed.errors[0];
      throw new Error(`CSV parse error at row ${firstError.row}: ${firstError.message}`);
    }

    const columnMap = validateCsvColumns(parsed.meta.fields || []);

    const normalizedRows = parsed.data.map((row: Record<string, string>) => normalizeCsvRow(row, columnMap));

    if (normalizedRows.length === 0) {
      throw new Error("CSV does not contain any valid rows");
    }

    validateCsvRows(normalizedRows);

    await heartbeatImportBatch(supabase, importBatchId);

    const normalizedTicketRecords = normalizedRows.map((row) => normalizeTicket(row));
    const {
      ticketRecords,
      duplicateRows
    } = dedupeTicketsById(normalizedTicketRecords);
    const uniqueTicketIds = [...new Set(ticketRecords.map((row) => row.ticket_id))];

    const existingTicketMap = new Map<string, ExistingTicketSnapshot>();

    for (const ticketIdChunk of chunkArray(uniqueTicketIds, SELECT_CHUNK_SIZE)) {
      const { data, error } = await supabase
        .from("tickets")
        .select(
          "ticket_id, type, comment, photo_url, address, subdistrict, district, province, timestamp, last_activity, state, org_response, org_list, dept_list, star, hashtag, lat, lng"
        )
        .in("ticket_id", ticketIdChunk);

      if (error) {
        throw new Error(`โหลดข้อมูลเรื่องเดิมไม่สำเร็จ: ${error.message}`);
      }

      for (const row of (data || []) as ExistingTicketSnapshot[]) {
        existingTicketMap.set(row.ticket_id, row);
      }

      await heartbeatImportBatch(supabase, importBatchId);
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
      if (ticketIndex > 0 && ticketIndex % IMPORT_HEARTBEAT_ROW_INTERVAL === 0) {
        await heartbeatImportBatch(supabase, importBatchId);
      }

      let ticket = sourceTicket;
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

    await heartbeatImportBatch(supabase, importBatchId);

    const { error: applyError } = await supabase.rpc("apply_import_batch", {
      p_import_batch_id: importBatchId,
      p_tickets: upsertRows,
      p_history: historyRows,
      p_total_rows: normalizedTicketRecords.length,
      p_processed_rows: ticketRecords.length,
      p_duplicate_rows: duplicateRows,
      p_new_tickets: newTickets,
      p_reopened_tickets: reopenedTickets,
      p_changed_tickets: changedTickets,
      p_unchanged_tickets: unchangedTickets,
      p_changed_fields: changedFields
    });

    if (applyError) {
      throw new Error(`บันทึกข้อมูลนำเข้าแบบ transaction ไม่สำเร็จ: ${applyError.message}`);
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
    if (importBatchId) {
      await markImportBatchFailed(importBatchId, error);
    }

    throw error;
  }
}
