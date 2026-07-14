import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { getReportBatchSummaryData } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ batchId: string }> }) {
  const params = await props.params;
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const summaryData = await getReportBatchSummaryData(params.batchId);

  if (summaryData.status === "missing_env") {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  if (summaryData.status === "unavailable") {
    return NextResponse.json({ error: summaryData.message }, { status: 500 });
  }

  if (summaryData.status === "not_found") {
    return NextResponse.json({ error: "ไม่พบรอบรายงานที่เลือก" }, { status: 404 });
  }

  return NextResponse.json(
    {
      batch: summaryData.batch,
      departmentCount: summaryData.departmentCount,
      itemCount: summaryData.itemCount,
      evidenceUploadedCount: summaryData.evidenceUploadedCount,
      evidencePendingCount: summaryData.evidencePendingCount,
      evidenceMissingCount: summaryData.evidenceMissingCount,
      evidencePendingReviewCount: summaryData.evidencePendingReviewCount,
      evidenceRejectedCount: summaryData.evidenceRejectedCount,
      evidenceApprovedCount: summaryData.evidenceApprovedCount,
      evidenceProgressPercent: summaryData.evidenceProgressPercent,
      uploadedDepartments: summaryData.uploadedDepartments,
      pendingDepartments: summaryData.pendingDepartments
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
