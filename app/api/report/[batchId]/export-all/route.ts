import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { resolveApiServiceResult } from "@/lib/api-service-result";
import { recordAuditEvent } from "@/lib/audit";
import { buildReportDepartmentExcelFilename, buildReportDepartmentWorkbookBuffer } from "@/lib/report-excel";
import { buildReportDepartmentPdfBuffer, buildReportDepartmentPdfFilename } from "@/lib/report-pdf";
import { getReportBatchDepartmentEvidenceStatuses, getReportDepartmentExportData } from "@/lib/report";
import { buildReportExportFailureAudit, buildReportExportSuccessAudit } from "@/lib/report/export-audit";
import { getSummaryReportData } from "@/lib/summary-report";
import { buildSummaryReportPdf, buildSummaryReportPdfFilename } from "@/lib/summary-report-pdf";
import {
  REPORT_EXPORT_BUCKET,
  REPORT_EXPORT_MAX_BYTES,
  sanitizeStorageSegment,
  uploadBufferAndCreateSignedDownload
} from "@/lib/storage";
import { createZipBuffer } from "@/lib/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ batchId: string }> }) {
  const params = await props.params;
  const unauthorized = await requireApiSession("reports:export");
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const departmentsData = await getReportBatchDepartmentEvidenceStatuses(params.batchId);
    const departmentsResolution = resolveApiServiceResult(departmentsData, {
      notFoundMessage: "ไม่พบรอบรายงานที่เลือก",
      unavailableMessage: "โหลดฝ่ายในรอบรายงานไม่สำเร็จ"
    });
    if (!departmentsResolution.ok) {
      return NextResponse.json(departmentsResolution.error.body, { status: departmentsResolution.error.status });
    }
    const readyDepartments = departmentsResolution.value;

    if (readyDepartments.departments.length === 0) {
      return NextResponse.json({ error: "ไม่พบฝ่ายในรอบรายงานนี้" }, { status: 404 });
    }

    const exportEntries = await Promise.all(
      readyDepartments.departments.map(async (department) => {
        const exportData = await getReportDepartmentExportData(params.batchId, department.dept_name);

        if (exportData.status !== "ready") {
          return { exportData, entries: [] };
        }

        const [excelBuffer, pdfBuffer] = await Promise.all([
          buildReportDepartmentWorkbookBuffer(exportData),
          buildReportDepartmentPdfBuffer(exportData).catch(() => null)
        ]);

        const entries: Array<{ filename: string; data: Buffer }> = [
          {
            filename: buildReportDepartmentExcelFilename(exportData),
            data: excelBuffer
          }
        ];

        if (pdfBuffer) {
          entries.push({
            filename: buildReportDepartmentPdfFilename(exportData),
            data: pdfBuffer
          });
        }

        return {
          exportData,
          entries
        };
      })
    );

    const failedExport = exportEntries.find((result) => result.exportData.status !== "ready");
    if (failedExport) {
      const failedResolution = resolveApiServiceResult(failedExport.exportData, {
        notFoundMessage: "ไม่พบรอบรายงานหรือฝ่ายที่เลือก",
        unavailableMessage: "โหลดข้อมูลสำหรับส่งออกรายงานรวมไม่สำเร็จ"
      });
      if (!failedResolution.ok) {
        return NextResponse.json(failedResolution.error.body, { status: failedResolution.error.status });
      }
    }

    const readyEntries: Array<{ filename: string; data: Buffer }> = [];

    for (const result of exportEntries) {
      for (const entry of result.entries) {
        readyEntries.push(entry);
      }
    }

    const firstReadyExport = exportEntries.find((result) => result.exportData.status === "ready")?.exportData;
    const fileDate = firstReadyExport?.status === "ready" ? firstReadyExport.batch.report_date : params.batchId;

    // Attach Executive Summary PDF if available for report_date
    if (fileDate) {
      try {
        const summaryData = await getSummaryReportData({ fromDate: fileDate, toDate: fileDate });
        const summaryPdfBuffer = await buildSummaryReportPdf(summaryData);
        const summaryFilename = buildSummaryReportPdfFilename(summaryData);
        readyEntries.unshift({
          filename: `summary-${summaryFilename}`,
          data: summaryPdfBuffer
        });
      } catch (summaryError) {
        // Fallback gracefully if summary data for exact date range is unavailable
        console.warn("Summary report PDF generation skipped:", summaryError);
      }
    }

    const zipBuffer = createZipBuffer(readyEntries);
    const filename = `executive-package-${fileDate}.zip`;
    const objectPath = `${params.batchId}/zip/${Date.now()}-${sanitizeStorageSegment(filename) || "reports.zip"}`;
    const signedUrl = await uploadBufferAndCreateSignedDownload({
      bucket: REPORT_EXPORT_BUCKET,
      path: objectPath,
      buffer: zipBuffer,
      contentType: "application/zip",
      filename,
      fileSizeLimit: REPORT_EXPORT_MAX_BYTES
    });

    await recordAuditEvent(
      buildReportExportSuccessAudit({
        batchId: params.batchId,
        format: "zip",
        metadata: { departmentCount: readyDepartments.departments.length, totalFiles: readyEntries.length, sizeBytes: zipBuffer.length, objectPath }
      })
    );

    return NextResponse.redirect(signedUrl);
  } catch (error) {
    await recordAuditEvent(
      buildReportExportFailureAudit({
        batchId: params.batchId,
        format: "zip",
        error
      })
    );
    return NextResponse.json({ error: "ส่งออกรายงานรวมไม่สำเร็จ" }, { status: 500 });
  }
}
