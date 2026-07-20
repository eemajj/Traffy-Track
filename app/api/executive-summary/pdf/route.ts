import { NextResponse } from "next/server";

import { getAnalyticsData, getAnalyticsPeriodDays } from "@/lib/analytics";
import { requireApiPermission } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit";
import { buildExecutiveSummaryPdf } from "@/lib/executive-pdf";
import { getSystemStatus } from "@/lib/system-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = await requireApiPermission("analytics:export");
  if (unauthorized) return unauthorized;
  try {
    const period = getAnalyticsPeriodDays(new URL(request.url).searchParams.get("period") || undefined);
    const [data, status] = await Promise.all([getAnalyticsData(period), getSystemStatus()]);
    if (data.status !== "ready") return NextResponse.json({ error: "ข้อมูลวิเคราะห์ยังไม่พร้อม" }, { status: 503 });
    const buffer = await buildExecutiveSummaryPdf(data, status);
    await recordAuditEvent({ action: "analytics.executive_summary_exported", resourceType: "analytics", resourceId: String(period), metadata: { periodDays: period, sizeBytes: buffer.length } });
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="executive-summary-${period}d.pdf"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "สร้าง PDF ไม่สำเร็จ" }, { status: 500 });
  }
}
