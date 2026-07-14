import { NextResponse } from "next/server";

import { requireApiRole, requireApiSession } from "@/lib/api-auth";
import { getCurrentSessionClaims } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import {
  attachReportDepartmentEvidence,
  createReportDepartmentEvidenceUpload,
  deleteReportDepartmentEvidence,
  getReportDepartmentEvidenceDownloadData,
  isEvidenceVersionId,
  reviewReportDepartmentEvidence
} from "@/lib/report";

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

  await recordAuditEvent({
    action: "evidence.downloaded",
    resourceType: "report_batch_department",
    resourceId: params.batchId,
    metadata: { department: dept }
  });

  return NextResponse.redirect(downloadData.signedUrl);
}

export async function POST(request: Request, props: { params: Promise<{ batchId: string }> }) {
  const params = await props.params;
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const payload = (await request.json().catch(() => null)) as {
    action?: "create-upload" | "complete-upload" | "review";
    dept?: string;
    filename?: string;
    contentType?: string;
    size?: number;
    path?: string;
    autoApprove?: boolean;
    decision?: "approved" | "rejected";
    evidenceVersionId?: string;
    note?: string;
  } | null;
  if (!payload) {
    return NextResponse.json({ error: "รูปแบบข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  }
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


    await recordAuditEvent({
      action: "evidence.upload_requested",
      resourceType: "report_batch_department",
      resourceId: uploadResult.department.id,
      metadata: { department: dept, filename: String(payload.filename || ""), size: Number(payload.size || 0) }
    });

    return NextResponse.json({
      ok: true,
      upload: uploadResult.upload
    });
  }

  if (payload.action === "complete-upload") {
    const claims = await getCurrentSessionClaims();
    if (!claims) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const autoApprove = payload.autoApprove === true;
    if (autoApprove && claims.role !== "admin") {
      return NextResponse.json({ error: "เฉพาะผู้ดูแลระบบเท่านั้นที่อัปโหลดและอนุมัติทันทีได้" }, { status: 403 });
    }

    const attachResult = await attachReportDepartmentEvidence({
      batchId: params.batchId,
      deptName: dept,
      objectPath: String(payload.path || ""),
      actorRole: claims.role
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


    await recordAuditEvent({
      action: attachResult.idempotent ? "evidence.upload_completion_retried" : "evidence.upload_completed",
      resourceType: "report_batch_department",
      resourceId: attachResult.department.id,
      actorRole: claims.role,
      metadata: {
        department: dept,
        version: attachResult.department.evidence_version_number,
        checksumPrefix: attachResult.department.evidence_sha256?.slice(0, 12) || null,
        evidenceVersionId: attachResult.evidenceVersionId,
        idempotent: attachResult.idempotent,
        isCurrentVersion: attachResult.isCurrentVersion
      }
    });

    let department = attachResult.department;
    let approvalWarning: string | null = null;
    let didAutoApprove = false;

    if (autoApprove) {
      const evidenceVersionId = attachResult.evidenceVersionId;
      if (!attachResult.isCurrentVersion || department.current_evidence_version_id !== evidenceVersionId) {
        approvalWarning = "อัปโหลดสำเร็จ แต่มีหลักฐานเวอร์ชันใหม่กว่าแล้ว ระบบจึงไม่อนุมัติไฟล์เก่าอัตโนมัติ";
      } else {
        const reviewResult = await reviewReportDepartmentEvidence({
          batchId: params.batchId,
          deptName: dept,
          evidenceVersionId,
          decision: "approved",
          note: null,
          actorRole: "admin"
        });

        if (reviewResult.status === "ready") {
          didAutoApprove = true;
          department = {
            ...department,
            evidence_review_status: "approved",
            evidence_review_note: null
          };
          await recordAuditEvent({
            action: reviewResult.idempotent ? "evidence.approval_retried" : "evidence.approved",
            resourceType: "report_batch_department",
            resourceId: department.id,
            actorRole: "admin",
            metadata: {
              department: dept,
              evidenceVersionId,
              source: "upload_and_approve",
              idempotent: reviewResult.idempotent
            }
          });
        } else {
          approvalWarning = "อัปโหลดสำเร็จ แต่ยังอนุมัติอัตโนมัติไม่สำเร็จ กรุณาตรวจและกดอนุมัติจากรายการหลักฐาน";
          await recordAuditEvent({
            action: "evidence.auto_approval_failed",
            resourceType: "report_batch_department",
            resourceId: department.id,
            actorRole: "admin",
            outcome: "failure",
            metadata: {
              department: dept,
              evidenceVersionId,
              reason: "message" in reviewResult ? reviewResult.message : reviewResult.status
            }
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      department,
      autoApproved: didAutoApprove,
      approvalWarning
    });
  }

  if (payload.action === "review") {
    const forbidden = await requireApiRole("admin");
    if (forbidden) return forbidden;

    if (payload.decision !== "approved" && payload.decision !== "rejected") {
      return NextResponse.json({ error: "ผลการตรวจหลักฐานไม่ถูกต้อง" }, { status: 400 });
    }
    const evidenceVersionId = String(payload.evidenceVersionId || "").trim();
    const note = String(payload.note || "").trim();
    if (!evidenceVersionId) {
      return NextResponse.json({ error: "ไม่พบเวอร์ชันหลักฐานที่ต้องการตรวจ", code: "evidence_version_required" }, { status: 400 });
    }
    if (!isEvidenceVersionId(evidenceVersionId)) {
      return NextResponse.json({ error: "รหัสเวอร์ชันหลักฐานไม่ถูกต้อง", code: "invalid_evidence_version_id" }, { status: 400 });
    }
    if (payload.decision === "rejected" && note.length < 5) {
      return NextResponse.json({ error: "กรุณาระบุเหตุผลที่ตีกลับอย่างน้อย 5 ตัวอักษร", code: "rejection_reason_required" }, { status: 400 });
    }
    if (note.length > 1000) {
      return NextResponse.json({ error: "เหตุผลหรือหมายเหตุต้องไม่เกิน 1,000 ตัวอักษร", code: "review_note_too_long" }, { status: 400 });
    }

    const reviewResult = await reviewReportDepartmentEvidence({
      batchId: params.batchId,
      deptName: dept,
      evidenceVersionId,
      decision: payload.decision,
      note: note || null,
      actorRole: "admin"
    });

    if (reviewResult.status === "missing_env") {
      return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
    }
    if (reviewResult.status === "not_found") {
      return NextResponse.json({ error: "ไม่พบรอบรายงานหรือฝ่ายที่เลือก" }, { status: 404 });
    }
    if (reviewResult.status === "invalid") {
      return NextResponse.json({ error: reviewResult.message, code: "invalid_evidence_review" }, { status: 400 });
    }
    if (reviewResult.status === "conflict") {
      return NextResponse.json({ error: reviewResult.message, code: "stale_evidence_version" }, { status: 409 });
    }
    if (reviewResult.status === "unavailable") {
      return NextResponse.json({ error: reviewResult.message }, { status: 500 });
    }


    await recordAuditEvent({
      action: reviewResult.idempotent
        ? "evidence.review_retried"
        : payload.decision === "approved" ? "evidence.approved" : "evidence.rejected",
      resourceType: "report_batch_department",
      resourceId: reviewResult.department.id,
      actorRole: "admin",
      metadata: { department: dept, evidenceVersionId, note: note || null, idempotent: reviewResult.idempotent }
    });

    return NextResponse.json({ ok: true, department: reviewResult.department });
  }

  return NextResponse.json({ error: "ไม่พบขั้นตอนการอัปโหลดหลักฐาน" }, { status: 400 });
}

export async function DELETE(request: Request, props: { params: Promise<{ batchId: string }> }) {
  const params = await props.params;
  const forbidden = await requireApiRole("admin");
  if (forbidden) return forbidden;

  const payload = (await request.json().catch(() => null)) as {
    dept?: string;
    evidenceVersionId?: string;
    reason?: string;
  } | null;
  const dept = String(payload?.dept || "").trim();
  const evidenceVersionId = String(payload?.evidenceVersionId || "").trim();
  const reason = String(payload?.reason || "").trim();

  if (!dept) {
    return NextResponse.json({ error: "ไม่พบชื่อฝ่ายที่ต้องการถอนหลักฐาน" }, { status: 400 });
  }
  if (!isEvidenceVersionId(evidenceVersionId)) {
    return NextResponse.json({ error: "รหัสเวอร์ชันหลักฐานไม่ถูกต้อง", code: "invalid_evidence_version_id" }, { status: 400 });
  }
  if (reason.length < 5) {
    return NextResponse.json({ error: "กรุณาระบุเหตุผลที่ถอนหลักฐานอย่างน้อย 5 ตัวอักษร", code: "withdrawal_reason_required" }, { status: 400 });
  }
  if (reason.length > 1000) {
    return NextResponse.json({ error: "เหตุผลที่ถอนหลักฐานต้องไม่เกิน 1,000 ตัวอักษร", code: "withdrawal_reason_too_long" }, { status: 400 });
  }

  const deleteResult = await deleteReportDepartmentEvidence(
    params.batchId,
    dept,
    evidenceVersionId,
    reason,
    "admin"
  );

  if (deleteResult.status === "missing_env") {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  if (deleteResult.status === "not_found") {
    return NextResponse.json({ error: "ไม่พบรอบรายงานหรือฝ่ายที่เลือก" }, { status: 404 });
  }

  if (deleteResult.status === "no_file") {
    return NextResponse.json({ error: "ฝ่ายนี้ยังไม่มีไฟล์หลักฐาน" }, { status: 404 });
  }

  if (deleteResult.status === "invalid") {
    return NextResponse.json({ error: deleteResult.message, code: "invalid_evidence_withdrawal" }, { status: 400 });
  }

  if (deleteResult.status === "conflict") {
    return NextResponse.json({ error: deleteResult.message, code: "stale_evidence_version" }, { status: 409 });
  }

  if (deleteResult.status === "unavailable") {
    return NextResponse.json({ error: deleteResult.message }, { status: 500 });
  }


  await recordAuditEvent({
    action: deleteResult.idempotent ? "evidence.withdrawal_retried" : "evidence.withdrawn",
    resourceType: "report_batch_department",
    resourceId: deleteResult.department.id,
    actorRole: "admin",
    metadata: { department: dept, evidenceVersionId, reason, idempotent: deleteResult.idempotent }
  });

  return NextResponse.json({
    ok: true,
    department: deleteResult.department
  });
}
