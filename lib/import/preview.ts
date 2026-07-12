import Papa from "papaparse";

import { analyzeCsvColumns, normalizeCsvRow, normalizeTicket } from "@/lib/import/normalize";
import type { ImportPreview } from "@/lib/import/types";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { IMPORT_BUCKET } from "@/lib/storage";
import { parseCoordinates } from "@/lib/coordinates";

const PREVIEW_BYTES = 512 * 1024;
const PREVIEW_MAX_ROWS = 300;

function trimToCompleteCsvLines(text: string) {
  const lastNewlineIndex = Math.max(text.lastIndexOf("\n"), text.lastIndexOf("\r"));

  if (lastNewlineIndex <= 0) {
    return text;
  }

  return text.slice(0, lastNewlineIndex);
}

function isInvalidTimestamp(value: string | undefined) {
  const normalized = (value || "").trim();
  return Boolean(normalized) && Number.isNaN(new Date(normalized).getTime());
}

function isInvalidCoords(value: string | undefined) {
  const normalized = (value || "").trim();

  if (!normalized) {
    return false;
  }

  const coords = parseCoordinates(normalized);
  return coords.lat === null || coords.lng === null;
}

function areTimestampValuesEqual(left: string | null, right: string | null) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isNaN(leftTime) || Number.isNaN(rightTime) ? left === right : leftTime === rightTime;
}

function estimateRows(input: {
  fileSize: number | null;
  bytesRead: number;
  sampledRows: number;
}) {
  if (!input.fileSize || input.bytesRead <= 0 || input.sampledRows <= 0 || input.fileSize <= input.bytesRead) {
    return null;
  }

  return Math.max(input.sampledRows, Math.round((input.fileSize / input.bytesRead) * input.sampledRows));
}

export async function previewImportCsvFromStorage(input: {
  path: string;
  filename: string;
  fileSize?: number | null;
}): Promise<ImportPreview> {
  const supabase = createSupabaseAdminClient();
  const signedUrlResult = await supabase.storage.from(IMPORT_BUCKET).createSignedUrl(input.path, 60);

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    throw new Error(`สร้างลิงก์อ่านตัวอย่างไฟล์ไม่สำเร็จ: ${signedUrlResult.error?.message || "ไม่ทราบสาเหตุ"}`);
  }

  const response = await fetch(signedUrlResult.data.signedUrl, {
    headers: {
      Range: `bytes=0-${PREVIEW_BYTES - 1}`
    },
    cache: "no-store"
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`อ่านตัวอย่างไฟล์ไม่สำเร็จ: HTTP ${response.status}`);
  }

  const previewBuffer = await response.arrayBuffer();
  const bytesRead = previewBuffer.byteLength;
  const rawPreviewText = new TextDecoder("utf-8").decode(previewBuffer);
  const isPartialPreview = bytesRead >= PREVIEW_BYTES && (!input.fileSize || bytesRead < input.fileSize);
  const previewText = isPartialPreview ? trimToCompleteCsvLines(rawPreviewText) : rawPreviewText;
  const parsed = Papa.parse<Record<string, string>>(previewText, {
    header: true,
    skipEmptyLines: "greedy"
  });
  const sampledRows = parsed.data.slice(0, PREVIEW_MAX_ROWS);
  const headers = parsed.meta.fields || [];
  const columnAnalysis = analyzeCsvColumns(headers);
  const parseWarnings = parsed.errors.slice(0, 5).map((error) => `แถว ${error.row ?? "-"}: ${error.message}`);

  if (columnAnalysis.missingRequiredColumns.length > 0) {
    return {
      filename: input.filename,
      bytesRead,
      fileSize: input.fileSize || null,
      sampledRows: sampledRows.length,
      estimatedRows: estimateRows({ fileSize: input.fileSize || null, bytesRead, sampledRows: sampledRows.length }),
      headers,
      mappedColumns: columnAnalysis.columnMap,
      missingRequiredColumns: columnAnalysis.missingRequiredColumns,
      missingOptionalColumns: columnAnalysis.missingOptionalColumns,
      blankTicketIdRows: 0,
      duplicateTicketIdRows: 0,
      invalidTimestampRows: 0,
      invalidCoordsRows: 0,
      missingCoordinateRows: 0,
      invalidStateRows: 0,
      blankOrgResponseRows: 0,
      sampledExistingTicketRows: 0,
      sampledNewTicketRows: 0,
      sampledChangedTicketRows: 0,
      parseWarnings,
      canImport: false
    };
  }

  const seenTicketIds = new Set<string>();
  let blankTicketIdRows = 0;
  let duplicateTicketIdRows = 0;
  let invalidTimestampRows = 0;
  let invalidCoordsRows = 0;
  let missingCoordinateRows = 0;
  let invalidStateRows = 0;
  let blankOrgResponseRows = 0;

  const normalizedRows = [];

  for (const rawRow of sampledRows) {
    const row = normalizeCsvRow(rawRow, columnAnalysis.columnMap);
    normalizedRows.push(normalizeTicket(row));
    const ticketId = row.ticket_id.trim();

    if (!ticketId) {
      blankTicketIdRows += 1;
    } else if (seenTicketIds.has(ticketId)) {
      duplicateTicketIdRows += 1;
    } else {
      seenTicketIds.add(ticketId);
    }

    if (isInvalidTimestamp(row.timestamp) || isInvalidTimestamp(row.last_activity)) {
      invalidTimestampRows += 1;
    }

    if (isInvalidCoords(row.coords)) {
      invalidCoordsRows += 1;
    } else if (!row.coords.trim()) {
      missingCoordinateRows += 1;
    }

    if (!row.state.trim()) {
      invalidStateRows += 1;
    }

    if (!row.org_response.trim()) {
      blankOrgResponseRows += 1;
    }
  }

  const ticketIds = normalizedRows.map((row) => row.ticket_id).filter(Boolean);
  let sampledExistingTicketRows = 0;
  let sampledNewTicketRows = 0;
  let sampledChangedTicketRows = 0;

  if (ticketIds.length > 0) {
    const existingResult = await supabase
      .from("tickets")
      .select("ticket_id, state, org_response, last_activity, star")
      .in("ticket_id", ticketIds);

    if (existingResult.error) {
      throw new Error(`ตรวจผลกระทบกับข้อมูลเดิมไม่สำเร็จ: ${existingResult.error.message}`);
    }

    const existingById = new Map(
      ((existingResult.data as Array<{ ticket_id: string; state: string | null; org_response: string | null; last_activity: string | null; star: number | null }> | null) || [])
        .map((row) => [row.ticket_id, row])
    );

    for (const ticket of normalizedRows) {
      const existing = existingById.get(ticket.ticket_id);
      if (!existing) {
        sampledNewTicketRows += 1;
        continue;
      }

      sampledExistingTicketRows += 1;
      if (
        (existing.state || null) !== ticket.state ||
        (existing.org_response || null) !== ticket.org_response ||
        !areTimestampValuesEqual(existing.last_activity, ticket.last_activity) ||
        (existing.star ?? null) !== ticket.star
      ) {
        sampledChangedTicketRows += 1;
      }
    }
  }

  return {
    filename: input.filename,
    bytesRead,
    fileSize: input.fileSize || null,
    sampledRows: sampledRows.length,
    estimatedRows: estimateRows({ fileSize: input.fileSize || null, bytesRead, sampledRows: sampledRows.length }),
    headers,
    mappedColumns: columnAnalysis.columnMap,
    missingRequiredColumns: columnAnalysis.missingRequiredColumns,
    missingOptionalColumns: columnAnalysis.missingOptionalColumns,
    blankTicketIdRows,
    duplicateTicketIdRows,
    invalidTimestampRows,
    invalidCoordsRows,
    missingCoordinateRows,
    invalidStateRows,
    blankOrgResponseRows,
    sampledExistingTicketRows,
    sampledNewTicketRows,
    sampledChangedTicketRows,
    parseWarnings,
    canImport: columnAnalysis.missingRequiredColumns.length === 0 && blankTicketIdRows < sampledRows.length
  };
}
