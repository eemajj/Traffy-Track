import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import {
  attachReportDepartmentEvidence,
  createReportDepartmentEvidenceUpload,
  deleteReportDepartmentEvidence,
  getReportDepartmentEvidenceDownloadData
} from "@/lib/report";

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

  return NextResponse.redirect(downloadData.signedUrl);
}

export async function POST(
  request: Request,
  { params }: { params: { batchId: string } }
) {
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const payload = (await request.json()) as {
    action?: "create-upload" | "complete-upload";
    dept?: string;
    filename?: string;
    contentType?: string;
    size?: number;
    path?: string;
  };
  const dept = String(payload.dept || "").trim();

  if (!dept) {
    return NextResponse.json({ error: "ไม่พบชื่อฝ่ายสำหรับอัปโหลดหลักฐาน" }, { status: 400 });
  }

  if (payload.action === "create-upload") {
    const uploadResult = await createReportDepartmentEvidenceUpload({
      batchId: params.batchId,
      deptName: dept,
      filename: String(payload.filename || ""),
      contentType: String(payload.contentType || ""),
      size: Number(payload.size || 0)
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
      upload: uploadResult.upload
    });
  }

  if (payload.action === "complete-upload") {
    const attachResult = await attachReportDepartmentEvidence({
      batchId: params.batchId,
      deptName: dept,
      objectPath: String(payload.path || "")
    });

    if (attachResult.status === "missing_env") {
      return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
    }

    if (attachResult.status === "invalid_file") {
      return NextResponse.json({ error: attachResult.message }, { status: 400 });
    }

    if (attachResult.status === "not_found") {
      return NextResponse.json({ error: "ไม่พบรอบรายงานหรือฝ่ายที่เลือก" }, { status: 404 });
    }

    if (attachResult.status === "unavailable") {
      return NextResponse.json({ error: attachResult.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      department: attachResult.department
    });
  }

  return NextResponse.json({ error: "ไม่พบขั้นตอนการอัปโหลดหลักฐาน" }, { status: 400 });
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
