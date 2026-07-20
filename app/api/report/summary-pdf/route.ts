import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit";
import { buildSummaryReportPdf, buildSummaryReportPdfFilename } from "@/lib/summary-report-pdf";
import { getSummaryReportData } from "@/lib/summary-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = await requireApiPermission("reports:export");
  if (unauthorized) return unauthorized;

  const searchParams = new URL(request.url).searchParams;
  const fromDate = searchParams.get("from") || "";
  const toDate = searchParams.get("to") || "";

  try {
    const data = await getSummaryReportData({ fromDate, toDate });
    const buffer = await buildSummaryReportPdf(data);
    const filename = buildSummaryReportPdfFilename(data);

    await recordAuditEvent({
      action: "report.summary_exported",
      resourceType: "summary_report",
      resourceId: `${fromDate}:${toDate}`,
      metadata: { fromDate, toDate, ticketCount: data.total, sizeBytes: buffer.length }
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "สร้างรายงานสรุป PDF ไม่สำเร็จ";
    await recordAuditEvent({
      action: "report.summary_export_failed",
      resourceType: "summary_report",
      resourceId: `${fromDate}:${toDate}`,
      outcome: "failure",
      metadata: { fromDate, toDate, message }
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
