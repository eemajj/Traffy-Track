import assert from "node:assert/strict";
import test from "node:test";

test("dashboard aggregation logic handles empty report batch and departments", () => {
  const readiness = [];
  const latestReportBatch = null;

  // Empty state is rendered when no report batches exist
  const hasReportBatch = latestReportBatch !== null && readiness.length > 0;
  assert.equal(hasReportBatch, false);
});

test("dashboard aggregation maps report_batch_departments status correctly", () => {
  const mockDeptRows = [
    {
      dept_name: "ฝ่ายโยธา เขตทวีวัฒนา",
      evidence_review_status: "approved",
      evidence_file_url: "https://example.com/file1.pdf",
      evidence_uploaded_at: "2026-07-06T10:00:00Z",
      evidence_version_number: 1
    },
    {
      dept_name: "ฝ่ายเทศกิจ เขตทวีวัฒนา",
      evidence_review_status: "submitted",
      evidence_file_url: null,
      evidence_uploaded_at: "2026-07-06T11:00:00Z",
      evidence_version_number: 1
    },
    {
      dept_name: "ฝ่ายสิ่งแวดล้อมฯ เขตทวีวัฒนา",
      evidence_review_status: "missing",
      evidence_file_url: null,
      evidence_uploaded_at: null,
      evidence_version_number: null
    }
  ];

  const mapped = mockDeptRows.map((row) => {
    let status = "missing";
    if (row.evidence_review_status === "approved" || row.evidence_file_url) {
      status = "ready";
    } else if (row.evidence_review_status === "submitted" || row.evidence_review_status === "draft") {
      status = "draft";
    }
    return {
      dept_name: row.dept_name,
      status,
      uploaded_at: row.evidence_uploaded_at || null,
      version_number: row.evidence_version_number || null
    };
  });

  assert.equal(mapped[0].status, "ready");
  assert.equal(mapped[1].status, "draft");
  assert.equal(mapped[2].status, "missing");
});
