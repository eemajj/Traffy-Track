import assert from "node:assert/strict";
import test from "node:test";
import { buildReportHref, getArchiveEvidenceBadge } from "../lib/report/page-model.ts";

test("report page model preserves filters and evidence labels", () => {
  assert.equal(buildReportHref({ status: "review", from: "2026-07-01", to: null }), "/report?status=review&from=2026-07-01");
  assert.deepEqual(getArchiveEvidenceBadge("approved", true, false), { label: "อนุมัติแล้ว", className: "bg-success/10 text-success" });
  assert.equal(getArchiveEvidenceBadge(null, true, true).label, "มีไฟล์ตามเกณฑ์เดิม");
});
