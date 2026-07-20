import assert from "node:assert/strict";
import test from "node:test";

import { createReportBatchCommandService } from "../lib/report/batch-command-core.ts";

const IDEMPOTENCY_KEY = "123e4567-e89b-42d3-a456-426614174000";

function success(data) {
  return { data, error: null };
}

function createDependencies(overrides = {}) {
  return {
    hasAdminEnv: () => true,
    createSnapshot: async () => success("batch-1"),
    updateBatch: async (input) => success({ id: input.batchId }),
    deleteBatch: async () => success(null),
    ...overrides
  };
}

test("batch creation validates date and idempotency before calling the transaction", async () => {
  let calls = 0;
  const service = createReportBatchCommandService(createDependencies({
    createSnapshot: async () => {
      calls += 1;
      return success("batch-1");
    }
  }));

  await assert.rejects(() => service.create({ reportDate: "18/07/2026", note: null, idempotencyKey: IDEMPOTENCY_KEY }), /วันที่/);
  await assert.rejects(() => service.create({ reportDate: "2026-07-18", note: null, idempotencyKey: "stale" }), /รหัสป้องกัน/);
  assert.equal(calls, 0);
});

test("batch creation preserves the exact transactional input and returned id", async () => {
  const calls = [];
  const service = createReportBatchCommandService(createDependencies({
    createSnapshot: async (input) => {
      calls.push(input);
      return success("batch-1");
    }
  }));

  assert.deepEqual(await service.create({
    reportDate: "2026-07-18",
    note: "รอบเดือนกรกฎาคม",
    idempotencyKey: IDEMPOTENCY_KEY
  }), { batchId: "batch-1" });
  assert.deepEqual(calls, [{
    reportDate: "2026-07-18",
    note: "รอบเดือนกรกฎาคม",
    idempotencyKey: IDEMPOTENCY_KEY
  }]);
});

test("batch update distinguishes unavailable and missing records", async () => {
  const unavailable = createReportBatchCommandService(createDependencies({
    updateBatch: async () => ({ data: null, error: { message: "database unavailable" } })
  }));
  await assert.rejects(
    () => unavailable.update({ batchId: "batch-1", reportDate: "2026-07-18", note: null }),
    /แก้ไขรอบรายงานไม่สำเร็จ: database unavailable/
  );

  const missing = createReportBatchCommandService(createDependencies({ updateBatch: async () => success(null) }));
  await assert.rejects(
    () => missing.update({ batchId: "batch-1", reportDate: "2026-07-18", note: null }),
    /ไม่พบรอบรายงานที่ต้องการแก้ไข/
  );
});

test("batch deletion fails closed and returns the deleted id", async () => {
  const missingEnv = createReportBatchCommandService(createDependencies({ hasAdminEnv: () => false }));
  await assert.rejects(() => missingEnv.delete("batch-1"), /ยังไม่ได้ตั้งค่า Supabase/);

  const service = createReportBatchCommandService(createDependencies());
  assert.deepEqual(await service.delete("batch-1"), { batchId: "batch-1" });
});
