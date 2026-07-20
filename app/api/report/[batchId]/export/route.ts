import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { resolveApiServiceResult } from "@/lib/api-service-result";
import { recordAuditEvent } from "@/lib/audit";
import { buildReportDepartmentExcelFilename, buildReportDepartmentWorkbookBuffer } from "@/lib/report-excel";
import { getReportDepartmentExportData } from "@/lib/report";
import { buildReportExportFailureAudit, buildReportExportSuccessAudit } from "@/lib/report/export-audit";
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
  const unauthorized = await requireApiSession("reports:export");
  if (unauthorized) {
    return unauthorized;
  }

  try {
  const { searchParams } = new URL(request.url);
  const dept = searchParams.get("dept");

  if (!dept) {
    return NextResponse.json({ error: "ไม่พบชื่อฝ่ายที่ต้องการส่งออก" }, { status: 400 });
  }

  const exportData = await getReportDepartmentExportData(params.batchId, dept);
  const resolution = resolveApiServiceResult(exportData, {
    notFoundMessage: "ไม่พบรอบรายงานหรือฝ่ายที่เลือก",
    unavailableMessage: "โหลดข้อมูลสำหรับส่งออกรายงานไม่สำเร็จ"
  });
  if (!resolution.ok) {
    return NextResponse.json(resolution.error.body, { status: resolution.error.status });
  }
  const readyExport = resolution.value;

  const buffer = await buildReportDepartmentWorkbookBuffer(readyExport);
  const filename = buildReportDepartmentExcelFilename(readyExport);
  const objectPath = `${params.batchId}/excel/${Date.now()}-${sanitizeStorageSegment(filename) || "report.xlsx"}`;
  const signedUrl = await uploadBufferAndCreateSignedDownload({
    bucket: REPORT_EXPORT_BUCKET,
    path: objectPath,
    buffer,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename,
    fileSizeLimit: REPORT_EXPORT_MAX_BYTES
  });

  await recordAuditEvent(buildReportExportSuccessAudit({
    batchId: params.batchId,
    format: "xlsx",
    metadata: { department: dept, sizeBytes: buffer.length, objectPath }
  }));

  return NextResponse.redirect(signedUrl);
  } catch (error) {
    await recordAuditEvent(buildReportExportFailureAudit({
      batchId: params.batchId,
      format: "xlsx",
      error
    }));
    return NextResponse.json({ error: "ส่งออกรายงานไม่สำเร็จ" }, { status: 500 });
  }
}
