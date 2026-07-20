import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReportExportFailureAudit,
  buildReportExportSuccessAudit
} from "../lib/report/export-audit.ts";

test("report export success audit preserves the shared resource envelope and format metadata", () => {
  assert.deepEqual(buildReportExportSuccessAudit({
    batchId: "batch-1",
    format: "xlsx",
    metadata: { department: "ฝ่ายโยธา", sizeBytes: 2048, objectPath: "batch-1/report.xlsx" }
  }), {
    action: "report.exported",
    resourceType: "report_batch",
    resourceId: "batch-1",
    metadata: {
      department: "ฝ่ายโยธา",
      sizeBytes: 2048,
      objectPath: "batch-1/report.xlsx",
      format: "xlsx"
    }
  });
});

test("report export failure audit fails closed for thrown and non-error values", () => {
  assert.deepEqual(buildReportExportFailureAudit({ batchId: "batch-1", format: "pdf", error: new Error("render failed") }), {
    action: "report.export_failed",
    resourceType: "report_batch",
    resourceId: "batch-1",
    outcome: "failure",
    metadata: { format: "pdf", message: "render failed" }
  });
  assert.equal(
    buildReportExportFailureAudit({ batchId: "batch-1", format: "zip", error: "failed" }).metadata.message,
    "unknown error"
  );
});
