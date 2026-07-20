import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { resolveApiServiceResult } from "@/lib/api-service-result";
import { getReportBatchSummaryData } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ batchId: string }> }) {
  const params = await props.params;
  const unauthorized = await requireApiSession("reports:manage");
  if (unauthorized) {
    return unauthorized;
  }

  const summaryData = await getReportBatchSummaryData(params.batchId);
  const resolution = resolveApiServiceResult(summaryData, { notFoundMessage: "ไม่พบรอบรายงานที่เลือก" });
  if (!resolution.ok) {
    return NextResponse.json(resolution.error.body, { status: resolution.error.status });
  }
  const summary = resolution.value;

  return NextResponse.json(
    {
      batch: summary.batch,
      departmentCount: summary.departmentCount,
      itemCount: summary.itemCount,
      evidenceUploadedCount: summary.evidenceUploadedCount,
      evidencePendingCount: summary.evidencePendingCount,
      evidenceMissingCount: summary.evidenceMissingCount,
      evidencePendingReviewCount: summary.evidencePendingReviewCount,
      evidenceRejectedCount: summary.evidenceRejectedCount,
      evidenceApprovedCount: summary.evidenceApprovedCount,
      evidenceProgressPercent: summary.evidenceProgressPercent,
      uploadedDepartments: summary.uploadedDepartments,
      pendingDepartments: summary.pendingDepartments
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
