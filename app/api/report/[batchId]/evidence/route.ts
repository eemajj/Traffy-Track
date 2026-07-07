import path from "node:path";

import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import {
  deleteReportDepartmentEvidence,
  getReportDepartmentEvidenceDownloadData,
  uploadReportDepartmentEvidence
} from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeFilenameSegment(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
}

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
    return NextResponse.json({ error: "ไม่พบชื่อฝ่ายที่ต้องการดูหลักฐาน" }, { status: 400 });
  }

  const downloadData = await getReportDepartmentEvidenceDownloadData(params.batchId, dept);

  if (downloadData.status === "missing_env") {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  if (downloadData.status === "unavailable") {
    return NextResponse.json({ error: downloadData.message }, { status: 500 });
  }

  if (downloadData.status === "not_found") {
    return NextResponse.json({ error: "ไม่พบรอบรายงานหรือฝ่ายที่เลือก" }, { status: 404 });
  }

  if (downloadData.status === "no_file") {
    return NextResponse.json({ error: "ฝ่ายนี้ยังไม่มีไฟล์หลักฐาน" }, { status: 404 });
  }

  const fileBuffer = Buffer.from(await downloadData.file.arrayBuffer());
  const originalExt = path.extname(downloadData.department.evidence_file_url) || "";
  const filename = `evidence-${downloadData.batch.report_date}-${sanitizeFilenameSegment(
    downloadData.department.dept_name
  )}${originalExt}`;

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": downloadData.file.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(
  request: Request,
  { params }: { params: { batchId: string } }
) {
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const formData = await request.formData();
  const dept = String(formData.get("dept") || "").trim();
  const fileEntry = formData.get("file");

  if (!dept) {
    return NextResponse.json({ error: "ไม่พบชื่อฝ่ายสำหรับอัปโหลดหลักฐาน" }, { status: 400 });
  }

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "ไม่พบไฟล์หลักฐานสำหรับอัปโหลด" }, { status: 400 });
  }

  const uploadResult = await uploadReportDepartmentEvidence({
    batchId: params.batchId,
    deptName: dept,
    file: fileEntry
  });

  if (uploadResult.status === "missing_env") {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  if (uploadResult.status === "invalid_file") {
    return NextResponse.json({ error: uploadResult.message }, { status: 400 });
  }

  if (uploadResult.status === "not_found") {
    return NextResponse.json({ error: "ไม่พบรอบรายงานหรือฝ่ายที่เลือก" }, { status: 404 });
  }

  if (uploadResult.status === "unavailable") {
    return NextResponse.json({ error: uploadResult.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    department: uploadResult.department
  });
}

export async function DELETE(
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
    return NextResponse.json({ error: "ไม่พบชื่อฝ่ายที่ต้องการลบหลักฐาน" }, { status: 400 });
  }

  const deleteResult = await deleteReportDepartmentEvidence(params.batchId, dept);

  if (deleteResult.status === "missing_env") {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  if (deleteResult.status === "not_found") {
    return NextResponse.json({ error: "ไม่พบรอบรายงานหรือฝ่ายที่เลือก" }, { status: 404 });
  }

  if (deleteResult.status === "no_file") {
    return NextResponse.json({ error: "ฝ่ายนี้ยังไม่มีไฟล์หลักฐาน" }, { status: 404 });
  }

  if (deleteResult.status === "unavailable") {
    return NextResponse.json({ error: deleteResult.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    department: deleteResult.department
  });
}
