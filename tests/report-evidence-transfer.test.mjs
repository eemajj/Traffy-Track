import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEvidenceDownloadFilename,
  buildEvidenceObjectPath,
  buildEvidenceUploadIntent,
  validateEvidenceObjectPath
} from "../lib/report/evidence-transfer-core.ts";
import { createEvidenceTransferService } from "../lib/report/evidence-transfer-orchestrator.ts";

const BATCH = { id: "batch-1", report_date: "2026-07-18", created_at: "2026-07-18T00:00:00Z", note: null };
const DEPARTMENT = {
  id: "department-1",
  dept_name: "ฝ่ายโยธา",
  evidence_file_url: "batch-1/department-1/file.pdf",
  evidence_uploaded_at: "2026-07-18T12:00:00Z"
};

function success(data) {
  return { data, error: null };
}

function createDependencies(overrides = {}) {
  return {
    hasAdminEnv: () => true,
    now: () => Date.parse("2026-07-18T12:00:00.000Z"),
    randomId: () => "random-1",
    sanitizeFilename: (value) => value.trim().replaceAll(" ", "-").toLowerCase(),
    validateUpload: () => null,
    loadBatch: async () => success(BATCH),
    loadDepartment: async () => success(DEPARTMENT),
    createUploadTarget: async (path) => ({
      bucket: "report-evidence",
      path,
      token: "token",
      signedUrl: "https://upload.example",
      supabaseUrl: "https://supabase.example",
      anonKey: "anon"
    }),
    insertUploadIntent: async () => success({}),
    downloadEvidence: async () => success({ blob: { fixture: true }, size: 2048 }),
    inspectEvidence: async () => ({ contentType: "application/pdf", sha256: "abc123" }),
    attachVersion: async () => success({ id: "version-1", idempotent: true }),
    enqueueDeletion: async () => {},
    loadProjection: async () => success({
      ...DEPARTMENT,
      current_evidence_version_id: "version-1",
      evidence_review_status: "pending",
      evidence_review_note: null,
      evidence_version_number: 2,
      evidence_original_filename: "file.pdf",
      evidence_sha256: "abc123"
    }),
    createSignedDownload: async () => success({ signedUrl: "https://download.example" }),
    ...overrides
  };
}

test("evidence object paths remain batch and department scoped", () => {
  const objectPath = buildEvidenceObjectPath({
    batchId: "batch-1",
    departmentId: "department-1",
    filename: " หนังสือ ตอบกลับ.PDF ",
    now: 1_721_300_000_000,
    randomId: "random-1",
    sanitizeFilename: (value) => value.trim().replaceAll(" ", "-").toLowerCase()
  });

  assert.equal(objectPath, "batch-1/department-1/1721300000000-random-1-หนังสือ-ตอบกลับ.pdf ");
  assert.equal(validateEvidenceObjectPath({ batchId: "batch-1", departmentId: "department-1", objectPath }), null);
  assert.equal(
    validateEvidenceObjectPath({ batchId: "batch-1", departmentId: "department-2", objectPath }),
    "ไฟล์หลักฐานไม่ตรงกับฝ่ายที่เลือก"
  );
  assert.equal(
    validateEvidenceObjectPath({ batchId: "batch-2", objectPath }),
    "ตำแหน่งไฟล์หลักฐานไม่ถูกต้อง"
  );
});

test("evidence upload intents preserve metadata and expire after fifteen minutes", () => {
  assert.deepEqual(buildEvidenceUploadIntent({
    departmentId: "department-1",
    objectPath: "batch-1/department-1/file.pdf",
    filename: "  ",
    contentType: "application/pdf",
    size: 1024,
    now: Date.parse("2026-07-18T12:00:00.000Z")
  }), {
    report_batch_department_id: "department-1",
    object_path: "batch-1/department-1/file.pdf",
    original_filename: "evidence",
    content_type: "application/pdf",
    expected_size_bytes: 1024,
    expires_at: "2026-07-18T12:15:00.000Z"
  });
});

test("evidence download filenames retain the stored extension and sanitize department names", () => {
  assert.equal(buildEvidenceDownloadFilename({
    reportDate: "2026-07-18",
    departmentName: "ฝ่ายโยธา / เขต 1",
    objectPath: "batch-1/department-1/file.PDF"
  }), "evidence-2026-07-18-ฝ่ายโยธา _ เขต 1.PDF");
});

test("transfer service creates a scoped upload target and matching durable intent", async () => {
  const intents = [];
  const service = createEvidenceTransferService(createDependencies({
    insertUploadIntent: async (intent) => {
      intents.push(intent);
      return success({});
    }
  }));

  const result = await service.createUpload({
    batchId: "batch-1",
    deptName: "ฝ่ายโยธา",
    filename: "reply.pdf",
    contentType: "application/pdf",
    size: 1024
  });

  assert.equal(result.status, "ready");
  assert.equal(result.upload.path, "batch-1/department-1/1784376000000-random-1-reply.pdf");
  assert.deepEqual(intents, [{
    report_batch_department_id: "department-1",
    object_path: result.upload.path,
    original_filename: "reply.pdf",
    content_type: "application/pdf",
    expected_size_bytes: 1024,
    expires_at: "2026-07-18T12:15:00.000Z"
  }]);
});

test("transfer service verifies signatures and returns the current attached projection", async () => {
  const attachCalls = [];
  const service = createEvidenceTransferService(createDependencies({
    attachVersion: async (input) => {
      attachCalls.push(input);
      return success({ id: "version-1", idempotent: true });
    }
  }));

  const result = await service.attach({
    batchId: "batch-1",
    deptName: "ฝ่ายโยธา",
    objectPath: "batch-1/department-1/file.pdf",
    actorRole: "operator"
  });

  assert.deepEqual(attachCalls, [{
    departmentId: "department-1",
    objectPath: "batch-1/department-1/file.pdf",
    size: 2048,
    contentType: "application/pdf",
    sha256: "abc123",
    actorRole: "operator"
  }]);
  assert.equal(result.status, "ready");
  assert.equal(result.idempotent, true);
  assert.equal(result.isCurrentVersion, true);
  assert.equal(result.department.evidence_sha256, "abc123");
});

test("transfer service queues failed attachments for reconciled deletion", async () => {
  const deletions = [];
  const service = createEvidenceTransferService(createDependencies({
    attachVersion: async () => ({ data: null, error: { message: "rpc failed" } }),
    enqueueDeletion: async (objectPath, reason) => deletions.push({ objectPath, reason })
  }));

  const result = await service.attach({
    batchId: "batch-1",
    deptName: "ฝ่ายโยธา",
    objectPath: "batch-1/department-1/file.pdf",
    actorRole: "admin"
  });

  assert.deepEqual(deletions, [{
    objectPath: "batch-1/department-1/file.pdf",
    reason: "evidence_attach_failed"
  }]);
  assert.deepEqual(result, { status: "unavailable", message: "บันทึกเวอร์ชันหลักฐานไม่สำเร็จ: rpc failed" });
});

test("transfer service creates ten-minute signed downloads with the stable filename", async () => {
  const signedCalls = [];
  const service = createEvidenceTransferService(createDependencies({
    createSignedDownload: async (input) => {
      signedCalls.push(input);
      return success({ signedUrl: "https://download.example" });
    }
  }));

  const result = await service.download("batch-1", "ฝ่ายโยธา");

  assert.equal(result.status, "ready");
  assert.deepEqual(signedCalls, [{
    objectPath: "batch-1/department-1/file.pdf",
    filename: "evidence-2026-07-18-ฝ่ายโยธา.pdf",
    expiresIn: 600
  }]);
});
