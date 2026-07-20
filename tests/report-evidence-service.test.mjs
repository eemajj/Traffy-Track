import assert from "node:assert/strict";
import test from "node:test";

import { createEvidenceMutationService } from "../lib/report/evidence-mutation-core.ts";

const VERSION_ID = "123e4567-e89b-42d3-a456-426614174000";
const DEPARTMENT = { id: "department-1", dept_name: "ฝ่ายโยธา" };

function success(data) {
  return { data, error: null };
}

function createDependencies(overrides = {}) {
  return {
    hasAdminEnv: () => true,
    loadBatch: async () => success({ id: "batch-1" }),
    loadDepartment: async () => success(DEPARTMENT),
    withdrawEvidence: async () => success({ idempotent: true, objectPath: "batch-1/department-1/file.pdf" }),
    loadUndoDeadline: async () => success({ next_attempt_at: "2026-07-18T12:15:00.000Z" }),
    undoWithdrawal: async () => success({}),
    loadProjection: async () => success({
      ...DEPARTMENT,
      evidence_file_url: "batch-1/department-1/file.pdf",
      evidence_uploaded_at: "2026-07-18T12:00:00.000Z",
      current_evidence_version_id: VERSION_ID,
      evidence_review_status: "pending",
      evidence_review_note: null,
      evidence_version_number: 2,
      evidence_original_filename: "evidence.pdf"
    }),
    reviewEvidence: async () => success({ idempotent: true }),
    ...overrides
  };
}

test("evidence withdrawal preserves exact-version RPC input, idempotency, and undo deadline", async () => {
  const calls = [];
  const service = createEvidenceMutationService(createDependencies({
    withdrawEvidence: async (input) => {
      calls.push(input);
      return success({ idempotent: true, objectPath: "batch-1/department-1/file.pdf" });
    }
  }));

  const result = await service.withdraw("batch-1", "ฝ่ายโยธา", VERSION_ID, "อัปโหลดผิดไฟล์", "admin");

  assert.deepEqual(calls, [{
    departmentId: "department-1",
    evidenceVersionId: VERSION_ID,
    actorRole: "admin",
    reason: "อัปโหลดผิดไฟล์"
  }]);
  assert.deepEqual(result, {
    status: "ready",
    idempotent: true,
    evidenceVersionId: VERSION_ID,
    undoUntil: "2026-07-18T12:15:00.000Z",
    department: {
      id: "department-1",
      dept_name: "ฝ่ายโยธา",
      evidence_file_url: null,
      evidence_uploaded_at: null
    }
  });
});

test("evidence mutation service preserves database conflict and validation statuses", async () => {
  const conflictService = createEvidenceMutationService(createDependencies({
    withdrawEvidence: async () => ({ data: null, error: { code: "PT409", message: "stale version" } }),
    reviewEvidence: async () => ({ data: null, error: { code: "PT400", message: "invalid review" } })
  }));

  assert.deepEqual(
    await conflictService.withdraw("batch-1", "ฝ่ายโยธา", VERSION_ID, "อัปโหลดผิดไฟล์", "admin"),
    { status: "conflict", message: "stale version" }
  );
  assert.deepEqual(await conflictService.review({
    batchId: "batch-1",
    deptName: "ฝ่ายโยธา",
    evidenceVersionId: VERSION_ID,
    decision: "rejected",
    note: "ข้อมูลไม่ครบ",
    actorRole: "admin"
  }), { status: "invalid", message: "invalid review" });
});

test("evidence undo reloads the durable projection after the RPC succeeds", async () => {
  const projection = await createDependencies().loadProjection();
  const service = createEvidenceMutationService(createDependencies());

  assert.deepEqual(await service.undo({
    batchId: "batch-1",
    deptName: "ฝ่ายโยธา",
    evidenceVersionId: VERSION_ID
  }), { status: "ready", department: projection.data });
});

test("evidence review returns the exact projected decision and fails closed without admin env", async () => {
  const service = createEvidenceMutationService(createDependencies());
  assert.deepEqual(await service.review({
    batchId: "batch-1",
    deptName: "ฝ่ายโยธา",
    evidenceVersionId: VERSION_ID,
    decision: "approved",
    note: null,
    actorRole: "admin"
  }), {
    status: "ready",
    idempotent: true,
    department: {
      id: "department-1",
      dept_name: "ฝ่ายโยธา",
      current_evidence_version_id: VERSION_ID,
      evidence_review_status: "approved",
      evidence_review_note: null
    }
  });

  const missingEnvService = createEvidenceMutationService(createDependencies({ hasAdminEnv: () => false }));
  assert.deepEqual(await missingEnvService.undo({
    batchId: "batch-1",
    deptName: "ฝ่ายโยธา",
    evidenceVersionId: VERSION_ID
  }), { status: "missing_env" });
});
