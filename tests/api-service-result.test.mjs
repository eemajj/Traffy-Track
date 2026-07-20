import assert from "node:assert/strict";
import test from "node:test";

import { resolveApiServiceResult } from "../lib/api-service-result.ts";

test("shared API service resolver preserves common status contracts", () => {
  const ready = { status: "ready", records: [1, 2] };
  assert.deepEqual(resolveApiServiceResult(ready), { ok: true, value: ready });
  assert.deepEqual(resolveApiServiceResult({ status: "missing_env" }), {
    ok: false,
    error: { status: 500, body: { error: "ระบบยังไม่ได้ตั้งค่า Supabase" } }
  });
  assert.deepEqual(resolveApiServiceResult({ status: "not_found" }, { notFoundMessage: "ไม่พบรอบรายงานที่เลือก" }), {
    ok: false,
    error: { status: 404, body: { error: "ไม่พบรอบรายงานที่เลือก" } }
  });
  assert.deepEqual(resolveApiServiceResult({ status: "unavailable", message: "ฐานข้อมูลไม่ตอบสนอง" }), {
    ok: false,
    error: { status: 500, body: { error: "ฐานข้อมูลไม่ตอบสนอง" } }
  });
});

test("shared API service resolver fails closed for unknown statuses", () => {
  assert.deepEqual(resolveApiServiceResult({ status: "unexpected" }, { unavailableMessage: "โหลดข้อมูลไม่สำเร็จ" }), {
    ok: false,
    error: { status: 500, body: { error: "โหลดข้อมูลไม่สำเร็จ" } }
  });
});
