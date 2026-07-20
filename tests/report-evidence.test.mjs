import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectEvidenceBlob,
  isEvidenceVersionId,
  REPORT_EVIDENCE_MAX_BYTES,
  validateEvidenceUpload
} from "../lib/report/evidence-file.ts";
import {
  validateEvidenceReviewInput,
  validateEvidenceWithdrawalInput
} from "../lib/report/evidence-validation.ts";
import { resolveEvidenceServiceResult } from "../lib/report/evidence-response.ts";

const VERSION_ID = "123e4567-e89b-42d3-a456-426614174000";

test("evidence version ids require a supported UUID shape", () => {
  assert.equal(isEvidenceVersionId(VERSION_ID), true);
  assert.equal(isEvidenceVersionId("../../report-evidence"), false);
  assert.equal(isEvidenceVersionId("123e4567-e89b-02d3-a456-426614174000"), false);
});

test("evidence upload validation preserves supported types and the 10 MB boundary", () => {
  assert.equal(validateEvidenceUpload({ contentType: "application/pdf", size: REPORT_EVIDENCE_MAX_BYTES }), null);
  assert.equal(
    validateEvidenceUpload({ contentType: "text/html", size: 100 }),
    "รองรับเฉพาะไฟล์ JPG, PNG, WebP และ PDF"
  );
  assert.equal(
    validateEvidenceUpload({ contentType: "image/png", size: REPORT_EVIDENCE_MAX_BYTES + 1 }),
    "ไฟล์ต้องมีขนาดไม่เกิน 10 MB"
  );
});

test("evidence inspection trusts file signatures rather than declared MIME types", async () => {
  const pdf = new Blob([new TextEncoder().encode("%PDF-1.7\nfixture")], { type: "text/plain" });
  const result = await inspectEvidenceBlob(pdf);

  assert.equal(result.contentType, "application/pdf");
  assert.match(result.sha256, /^[0-9a-f]{64}$/);
  await assert.rejects(() => inspectEvidenceBlob(new Blob(["<script>not evidence</script>"])), /ชนิดไฟล์จริง/);
});

test("evidence review validation binds decisions to an exact version", () => {
  assert.deepEqual(validateEvidenceReviewInput({ decision: "approved", evidenceVersionId: VERSION_ID }), {
    value: { decision: "approved", evidenceVersionId: VERSION_ID, note: "" }
  });
  assert.deepEqual(validateEvidenceReviewInput({ decision: "rejected", evidenceVersionId: VERSION_ID, note: "สั้น" }), {
    error: "กรุณาระบุเหตุผลที่ตีกลับอย่างน้อย 5 ตัวอักษร",
    code: "rejection_reason_required"
  });
  assert.equal(
    "error" in validateEvidenceReviewInput({ decision: "approved", evidenceVersionId: "stale" }),
    true
  );
});

test("evidence withdrawal validation trims accepted input and rejects unsafe requests", () => {
  assert.deepEqual(
    validateEvidenceWithdrawalInput({ dept: " ฝ่ายโยธา ", evidenceVersionId: VERSION_ID, reason: " อัปโหลดผิดไฟล์ " }),
    { value: { dept: "ฝ่ายโยธา", evidenceVersionId: VERSION_ID, reason: "อัปโหลดผิดไฟล์" } }
  );
  assert.deepEqual(validateEvidenceWithdrawalInput({ dept: "", evidenceVersionId: VERSION_ID, reason: "เพียงพอ" }), {
    error: "ไม่พบชื่อฝ่ายที่ต้องการถอนหลักฐาน",
    code: "department_required"
  });
});

test("evidence service errors preserve the route HTTP contract", () => {
  assert.deepEqual(resolveEvidenceServiceResult("download", { status: "no_file" }), {
    ok: false,
    error: { status: 404, body: { error: "ฝ่ายนี้ยังไม่มีไฟล์หลักฐาน" } }
  });
  assert.deepEqual(resolveEvidenceServiceResult("create-upload", { status: "invalid_file", message: "ไฟล์ใหญ่เกินไป" }), {
    ok: false,
    error: { status: 400, body: { error: "ไฟล์ใหญ่เกินไป" } }
  });
  assert.deepEqual(resolveEvidenceServiceResult("review", { status: "conflict", message: "เวอร์ชันเปลี่ยนแล้ว" }), {
    ok: false,
    error: { status: 409, body: { error: "เวอร์ชันเปลี่ยนแล้ว", code: "stale_evidence_version" } }
  });
  assert.deepEqual(resolveEvidenceServiceResult("undo-withdrawal", { status: "conflict", message: "หมดเวลายกเลิก" }), {
    ok: false,
    error: { status: 409, body: { error: "หมดเวลายกเลิก" } }
  });
  const ready = { status: "ready", department: { id: "department-1" } };
  assert.deepEqual(resolveEvidenceServiceResult("review", ready), { ok: true, value: ready });
});
