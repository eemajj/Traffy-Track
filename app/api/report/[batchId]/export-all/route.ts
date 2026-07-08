import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { buildReportDepartmentExcelFilename, buildReportDepartmentWorkbookBuffer } from "@/lib/report-excel";
import { getReportBatchDepartmentEvidenceStatuses, getReportDepartmentExportData } from "@/lib/report";
import {
  REPORT_EXPORT_BUCKET,
  REPORT_EXPORT_MAX_BYTES,
  sanitizeStorageSegment,
  uploadBufferAndCreateSignedDownload
} from "@/lib/storage";
import { createZipBuffer } from "@/lib/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { batchId: string } }
) {
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const departmentsData = await getReportBatchDepartmentEvidenceStatuses(params.batchId);

  if (departmentsData.status === "missing_env") {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  if (departmentsData.status === "unavailable") {
    return NextResponse.json({ error: departmentsData.message }, { status: 500 });
  }

  if (departmentsData.status === "not_found") {
    return NextResponse.json({ error: "ไม่พบรอบรายงานที่เลือก" }, { status: 404 });
  }

  if (departmentsData.departments.length === 0) {
    return NextResponse.json({ error: "ไม่พบฝ่ายในรอบรายงานนี้" }, { status: 404 });
  }

  const exportEntries = await Promise.all(
    departmentsData.departments.map(async (department) => {
      const exportData = await getReportDepartmentExportData(params.batchId, department.dept_name);

      if (exportData.status !== "ready") {
        return { exportData, entry: null };
      }

      const buffer = await buildReportDepartmentWorkbookBuffer(exportData);
      return {
        exportData,
        entry: {
          filename: buildReportDepartmentExcelFilename(exportData),
          data: buffer
        }
      };
    })
  );

  const failedExport = exportEntries.find((result) => result.exportData.status !== "ready");

  if (failedExport?.exportData.status === "missing_env") {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  if (failedExport?.exportData.status === "unavailable") {
    return NextResponse.json({ error: failedExport.exportData.message }, { status: 500 });
  }

  if (failedExport?.exportData.status === "not_found") {
    return NextResponse.json({ error: "ไม่พบรอบรายงานหรือฝ่ายที่เลือก" }, { status: 404 });
  }

  const readyEntries: Array<{ filename: string; data: Buffer<ArrayBufferLike> }> = [];

  for (const result of exportEntries) {
    if (result.entry) {
      readyEntries.push(result.entry);
    }
  }

  const zipBuffer = createZipBuffer(readyEntries);
  const firstReadyExport = exportEntries.find((result) => result.exportData.status === "ready")?.exportData;
  const fileDate = firstReadyExport?.status === "ready" ? firstReadyExport.batch.report_date : params.batchId;
  const filename = `report-${fileDate}-all-departments.zip`;
  const objectPath = `${params.batchId}/zip/${Date.now()}-${sanitizeStorageSegment(filename) || "reports.zip"}`;
  const signedUrl = await uploadBufferAndCreateSignedDownload({
    bucket: REPORT_EXPORT_BUCKET,
    path: objectPath,
    buffer: zipBuffer,
    contentType: "application/zip",
    filename,
    fileSizeLimit: REPORT_EXPORT_MAX_BYTES
  });

  return NextResponse.redirect(signedUrl);
}
