import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { buildReportDepartmentExcelFilename, buildReportDepartmentWorkbookBuffer } from "@/lib/report-excel";
import { getReportDepartmentExportData } from "@/lib/report";
import {
  REPORT_EXPORT_BUCKET,
  REPORT_EXPORT_MAX_BYTES,
  sanitizeStorageSegment,
  uploadBufferAndCreateSignedDownload
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, props: { params: Promise<{ batchId: string }> }) {
  const params = await props.params;
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const { searchParams } = new URL(request.url);
  const dept = searchParams.get("dept");

  if (!dept) {
    return NextResponse.json({ error: "ไม่พบชื่อฝ่ายที่ต้องการส่งออก" }, { status: 400 });
  }

  const exportData = await getReportDepartmentExportData(params.batchId, dept);

  if (exportData.status === "missing_env") {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  if (exportData.status === "unavailable") {
    return NextResponse.json({ error: exportData.message }, { status: 500 });
  }

  if (exportData.status === "not_found") {
    return NextResponse.json({ error: "ไม่พบรอบรายงานหรือฝ่ายที่เลือก" }, { status: 404 });
  }

  const buffer = await buildReportDepartmentWorkbookBuffer(exportData);
  const filename = buildReportDepartmentExcelFilename(exportData);
  const objectPath = `${params.batchId}/excel/${Date.now()}-${sanitizeStorageSegment(filename) || "report.xlsx"}`;
  const signedUrl = await uploadBufferAndCreateSignedDownload({
    bucket: REPORT_EXPORT_BUCKET,
    path: objectPath,
    buffer,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename,
    fileSizeLimit: REPORT_EXPORT_MAX_BYTES
  });

  return NextResponse.redirect(signedUrl);
}
