import assert from "node:assert/strict";
import test from "node:test";

import {
  formatImportBytes,
  formatImportAttempt,
  formatImportJobHistoryNote,
  formatImportJobStatus,
  formatImportStateLabel,
  formatImportStageLabel,
  formatImportSubmitLabel,
  getImportJobStage,
  getImportPreviewWarnings
} from "../lib/import/client-model.ts";

function preview(overrides = {}) {
  return {
    missingOptionalColumns: [],
    blankTicketIdRows: 0,
    duplicateTicketIdRows: 0,
    invalidTimestampRows: 0,
    invalidCoordsRows: 0,
    invalidStarRows: 0,
    missingCoordinateRows: 0,
    invalidStateRows: 0,
    blankOrgResponseRows: 0,
    parseWarnings: [],
    canImport: true,
    ...overrides
  };
}

test("import client labels preserve the two-step preview and confirmation workflow", () => {
  assert.equal(formatImportStageLabel("previewing"), "กำลังตรวจไฟล์ตัวอย่างก่อนนำเข้า");
  assert.equal(
    formatImportSubmitLabel({ requestState: "idle", importStage: "idle", preview: null }),
    "ตรวจไฟล์ก่อนนำเข้า"
  );
  assert.equal(formatImportStateLabel("idle", "ready"), "ตรวจไฟล์แล้ว รอยืนยันนำเข้า");
  assert.equal(formatImportStateLabel("idle", "error"), "ไฟล์ต้องแก้ไขก่อนนำเข้า");
  assert.equal(
    formatImportSubmitLabel({ requestState: "idle", importStage: "ready", preview: preview() }),
    "ยืนยันนำเข้า"
  );
  assert.equal(
    formatImportSubmitLabel({ requestState: "idle", importStage: "error", preview: preview({ canImport: false }) }),
    "แก้ไฟล์ก่อนนำเข้า"
  );
});

test("import job labels expose real retry state and bounded attempts", () => {
  const retryingJob = { status: "queued", attemptCount: 2, maxAttempts: 5 };
  assert.equal(formatImportStageLabel("retrying"), "ระบบพักงานชั่วคราวและจะลองประมวลผลอีกครั้ง");
  assert.equal(formatImportJobStatus(retryingJob), "รอลองใหม่");
  assert.match(formatImportAttempt(retryingJob), /2.*5/);
});

test("legacy completed import history does not present an unknown processed count as zero", () => {
  assert.equal(
    formatImportJobHistoryNote({ status: "completed", totalRows: 125, processedRows: 0, duplicateRows: 0 }),
    "รอบข้อมูลเดิมไม่มีการบันทึกจำนวนเรื่องที่ประมวลผล"
  );
  assert.equal(
    formatImportJobHistoryNote({ status: "completed", totalRows: 125, processedRows: 0, duplicateRows: 3 }),
    "รอบข้อมูลเดิมไม่มีการบันทึกจำนวนเรื่องที่ประมวลผล · ข้ามซ้ำ 3 แถว"
  );
});

test("current completed import history retains processed and duplicate counts", () => {
  const note = formatImportJobHistoryNote({ status: "completed", totalRows: 125, processedRows: 122, duplicateRows: 3 });
  assert.match(note, /ประมวลผล 122 เรื่อง/);
  assert.match(note, /ข้ามซ้ำ 3 แถว/);
});

test("V2 processing phase maps to staging and atomic-finalizing UI states", () => {
  assert.equal(getImportJobStage({ status: "running", processingPhase: "staging" }), "processing");
  assert.equal(getImportJobStage({ status: "running", processingPhase: "finalizing" }), "finishing");
  assert.equal(getImportJobStage({ status: "queued", processingPhase: "finalizing", attemptCount: 0 }), "queued");
  assert.equal(getImportJobStage({ status: "completed", processingPhase: "staging" }), "success");
  assert.equal(getImportJobStage({ status: "failed", processingPhase: "finalizing" }), "error");
  assert.equal(getImportJobStage({}), "error");
  assert.equal(formatImportJobStatus({ status: "running", processingPhase: "staging" }), "กำลังเตรียมข้อมูล");
  assert.equal(formatImportJobStatus({ status: "running", processingPhase: "finalizing" }), "กำลังบันทึกขั้นสุดท้าย");
});

test("import preview warnings include local quality signals and parser warnings", () => {
  const warnings = getImportPreviewWarnings(
    preview({
      missingOptionalColumns: ["photo"],
      duplicateTicketIdRows: 2,
      missingCoordinateRows: 1,
      parseWarnings: ["ตัวอย่างคำเตือนจาก parser"]
    })
  );

  assert.equal(warnings.length, 4);
  assert.match(warnings[0], /photo/);
  assert.match(warnings[1], /ticket_id ซ้ำ/);
  assert.match(warnings[2], /ไม่ปรากฏบนแผนที่/);
  assert.equal(warnings[3], "ตัวอย่างคำเตือนจาก parser");
});

test("import byte formatting keeps empty and binary-unit boundaries stable", () => {
  assert.equal(formatImportBytes(0), "-");
  assert.match(formatImportBytes(1024), /1\sKB$/);
  assert.match(formatImportBytes(10 * 1024 * 1024), /10\sMB$/);
});
