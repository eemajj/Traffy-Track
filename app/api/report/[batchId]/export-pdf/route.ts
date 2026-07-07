import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { buildReportDepartmentPdfBuffer, buildReportDepartmentPdfFilename } from "@/lib/report-pdf";
import { getReportDepartmentExportData } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { batchId: string } }
) {
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

  const buffer = await buildReportDepartmentPdfBuffer(exportData);
  const filename = buildReportDepartmentPdfFilename(exportData);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store"
    }
  });
}
