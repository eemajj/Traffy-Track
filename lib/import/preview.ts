import Papa from "papaparse";

import { analyzeCsvColumns, normalizeCsvRow } from "@/lib/import/normalize";
import type { ImportPreview } from "@/lib/import/types";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { IMPORT_BUCKET } from "@/lib/storage";

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

  const parts = normalized.split(",").map((part) => Number.parseFloat(part.trim()));
  return parts.length !== 2 || parts.some((part) => Number.isNaN(part));
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
      parseWarnings,
      canImport: false
    };
  }

  const seenTicketIds = new Set<string>();
  let blankTicketIdRows = 0;
  let duplicateTicketIdRows = 0;
  let invalidTimestampRows = 0;
  let invalidCoordsRows = 0;

  for (const rawRow of sampledRows) {
    const row = normalizeCsvRow(rawRow, columnAnalysis.columnMap);
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
    parseWarnings,
    canImport: columnAnalysis.missingRequiredColumns.length === 0 && blankTicketIdRows < sampledRows.length
  };
}
