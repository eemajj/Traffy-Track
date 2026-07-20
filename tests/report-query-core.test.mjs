import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArchivePayload,
  fetchAllReportRows,
  normalizeDateFilter,
  normalizeReportArchiveSort,
  normalizeReportArchiveStatus,
  resolveReportItemTicket
} from "../lib/report/query-core.ts";

test("report filters fail closed to stable defaults", () => {
  assert.equal(normalizeReportArchiveStatus("review"), "review");
  assert.equal(normalizeReportArchiveStatus("unknown"), "all");
  assert.equal(normalizeReportArchiveSort("progress_asc"), "progress_asc");
  assert.equal(normalizeReportArchiveSort("unknown"), "report_date_desc");
  assert.equal(normalizeDateFilter("2026-07-18"), "2026-07-18");
  assert.equal(normalizeDateFilter("18/07/2026"), "");
});

test("report pagination loads every full page and preserves error context", async () => {
  const calls = [];
  const rows = await fetchAllReportRows(async (from, to) => {
    calls.push([from, to]);
    return { data: from === 0 ? Array.from({ length: 1000 }, (_, id) => id) : [1000], error: null };
  }, "โหลดข้อมูลไม่สำเร็จ");

  assert.equal(rows.length, 1001);
  assert.deepEqual(calls, [[0, 999], [1000, 1999]]);
  await assert.rejects(
    () => fetchAllReportRows(async () => ({ data: null, error: { message: "offline" } }), "โหลดข้อมูลไม่สำเร็จ"),
    /โหลดข้อมูลไม่สำเร็จ: offline/
  );
});

test("ticket resolution prefers immutable snapshots and falls back for legacy rows", () => {
  const base = {
    id: 1,
    dept_name: "ฝ่ายโยธา",
    ticket_id: "T-1",
    snapshot_type: "snapshot type",
    snapshot_comment: "snapshot comment",
    snapshot_address: null,
    snapshot_subdistrict: null,
    snapshot_timestamp: null,
    snapshot_last_activity: null,
    snapshot_state: "snapshot state",
    snapshot_org_response: null,
    tickets: { ticket_id: "T-1", type: "live type", state: "live state", comment: "live comment", address: null, subdistrict: null, timestamp: null, last_activity: null, org_response: null }
  };

  assert.equal(resolveReportItemTicket({ ...base, snapshot_captured_at: "2026-07-18T00:00:00Z" }).comment, "snapshot comment");
  assert.equal(resolveReportItemTicket({ ...base, snapshot_captured_at: null }).comment, "live comment");
});

test("archive payload freezes evidence semantics, department counts and deletion time", () => {
  const archivedAt = "2026-07-18T12:00:00.000Z";
  const payload = buildArchivePayload({
    batch: { id: "batch-1", report_date: "2026-07-18", created_at: "2026-07-18T00:00:00Z", note: null },
    departments: [{
      id: "dept-1",
      report_batch_id: "batch-1",
      dept_name: "ฝ่ายโยธา",
      evidence_file_url: "batch-1/dept-1/reply.pdf",
      evidence_uploaded_at: archivedAt,
      evidence_review_status: "approved"
    }],
    items: [{ id: 1, report_batch_id: "batch-1", dept_name: "ฝ่ายโยธา", ticket_id: "T-1" }],
    sourceDeleted: true,
    now: () => archivedAt
  });

  assert.equal(payload.completion_semantics, "approved_v1");
  assert.equal(payload.completion_status, "complete");
  assert.equal(payload.departments[0].item_count, 1);
  assert.equal(payload.source_deleted_at, archivedAt);
  assert.equal(payload.archived_at, archivedAt);
});
