import { NextResponse } from "next/server";

import { requireApiRole, requireApiSession } from "@/lib/api-auth";
import { getCurrentSessionClaims } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit";
import {
  validateEvidenceReviewInput,
  validateEvidenceWithdrawalInput
} from "@/lib/report/evidence-validation";
import { resolveEvidenceServiceResult } from "@/lib/report/evidence-response";
import {
  attachReportDepartmentEvidence,
  createReportDepartmentEvidenceUpload,
  deleteReportDepartmentEvidence,
  getReportDepartmentEvidenceDownloadData,
  isEvidenceVersionId,
  reviewReportDepartmentEvidence,
  undoReportDepartmentEvidenceWithdrawal
} from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, props: { params: Promise<{ batchId: string }> }) {
  const params = await props.params;
  const unauthorized = await requireApiSession("reports:evidence");
  if (unauthorized) {
    return unauthorized;
  }

  const { searchParams } = new URL(request.url);
  const dept = searchParams.get("dept");

  if (!dept) {
    return NextResponse.json({ error: "ไม่พบชื่อฝ่ายที่ต้องการดูหลักฐาน" }, { status: 400 });
  }

  const downloadData = await getReportDepartmentEvidenceDownloadData(params.batchId, dept);
  const downloadResolution = resolveEvidenceServiceResult("download", downloadData);
  if (!downloadResolution.ok) {
    return NextResponse.json(downloadResolution.error.body, { status: downloadResolution.error.status });
  }

  await recordAuditEvent({
    action: "evidence.downloaded",
    resourceType: "report_batch_department",
    resourceId: params.batchId,
    metadata: { department: dept }
  });

  return NextResponse.redirect(downloadResolution.value.signedUrl);
}

export async function POST(request: Request, props: { params: Promise<{ batchId: string }> }) {
  const params = await props.params;
  const unauthorized = await requireApiSession("reports:evidence");
  if (unauthorized) {
    return unauthorized;
  }

  const payload = (await request.json().catch(() => null)) as {
    action?: "create-upload" | "complete-upload" | "review" | "undo-withdrawal";
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

  if (payload.action === "undo-withdrawal") {
    const forbidden = await requireApiRole("admin");
    if (forbidden) return forbidden;
    const evidenceVersionId = String(payload.evidenceVersionId || "").trim();
    if (!isEvidenceVersionId(evidenceVersionId)) {
      return NextResponse.json({ error: "รหัสเวอร์ชันหลักฐานไม่ถูกต้อง" }, { status: 400 });
    }
    const result = await undoReportDepartmentEvidenceWithdrawal({
      batchId: params.batchId,
      deptName: dept,
      evidenceVersionId
    });
    const undoResolution = resolveEvidenceServiceResult("undo-withdrawal", result);
    if (!undoResolution.ok) {
      return NextResponse.json(undoResolution.error.body, { status: undoResolution.error.status });
    }
    const readyResult = undoResolution.value;
    await recordAuditEvent({
      action: "evidence.withdrawal_undone",
      resourceType: "report_batch_department",
      resourceId: readyResult.department.id,
      actorRole: "admin",
      metadata: { department: dept, evidenceVersionId }
    });
    return NextResponse.json({ ok: true, department: readyResult.department });
  }

  if (payload.action === "create-upload") {
    const uploadResult = await createReportDepartmentEvidenceUpload({
      batchId: params.batchId,
      deptName: dept,
      filename: String(payload.filename || ""),
      contentType: String(payload.contentType || ""),
      size: Number(payload.size || 0)
    });
    const uploadResolution = resolveEvidenceServiceResult("create-upload", uploadResult);
    if (!uploadResolution.ok) {
      return NextResponse.json(uploadResolution.error.body, { status: uploadResolution.error.status });
    }
    const readyUpload = uploadResolution.value;

    await recordAuditEvent({
      action: "evidence.upload_requested",
      resourceType: "report_batch_department",
      resourceId: readyUpload.department.id,
      metadata: { department: dept, filename: String(payload.filename || ""), size: Number(payload.size || 0) }
    });

    return NextResponse.json({
      ok: true,
      upload: readyUpload.upload
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
    const attachResolution = resolveEvidenceServiceResult("complete-upload", attachResult);
    if (!attachResolution.ok) {
      return NextResponse.json(attachResolution.error.body, { status: attachResolution.error.status });
    }
    const readyAttach = attachResolution.value;

    await recordAuditEvent({
      action: readyAttach.idempotent ? "evidence.upload_completion_retried" : "evidence.upload_completed",
      resourceType: "report_batch_department",
      resourceId: readyAttach.department.id,
      actorRole: claims.role,
      metadata: {
        department: dept,
        version: readyAttach.department.evidence_version_number,
        checksumPrefix: readyAttach.department.evidence_sha256?.slice(0, 12) || null,
        evidenceVersionId: readyAttach.evidenceVersionId,
        idempotent: readyAttach.idempotent,
        isCurrentVersion: readyAttach.isCurrentVersion
      }
    });

    let department = readyAttach.department;
    let approvalWarning: string | null = null;
    let didAutoApprove = false;

    if (autoApprove) {
      const evidenceVersionId = readyAttach.evidenceVersionId;
      if (!readyAttach.isCurrentVersion || department.current_evidence_version_id !== evidenceVersionId) {
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

    const validation = validateEvidenceReviewInput(payload);
    if ("error" in validation) {
      return NextResponse.json(validation, { status: 400 });
    }
    const { decision, evidenceVersionId, note } = validation.value;

    const reviewResult = await reviewReportDepartmentEvidence({
      batchId: params.batchId,
      deptName: dept,
      evidenceVersionId,
      decision,
      note: note || null,
      actorRole: "admin"
    });
    const reviewResolution = resolveEvidenceServiceResult("review", reviewResult);
    if (!reviewResolution.ok) {
      return NextResponse.json(reviewResolution.error.body, { status: reviewResolution.error.status });
    }
    const readyReview = reviewResolution.value;

    await recordAuditEvent({
      action: readyReview.idempotent
        ? "evidence.review_retried"
        : decision === "approved" ? "evidence.approved" : "evidence.rejected",
      resourceType: "report_batch_department",
      resourceId: readyReview.department.id,
      actorRole: "admin",
      metadata: { department: dept, evidenceVersionId, note: note || null, idempotent: readyReview.idempotent }
    });

    return NextResponse.json({ ok: true, department: readyReview.department });
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
  const validation = validateEvidenceWithdrawalInput(payload || {});
  if ("error" in validation) {
    const { error, code } = validation;
    return NextResponse.json(code === "department_required" ? { error } : { error, code }, { status: 400 });
  }
  const { dept, evidenceVersionId, reason } = validation.value;

  const deleteResult = await deleteReportDepartmentEvidence(
    params.batchId,
    dept,
    evidenceVersionId,
    reason,
    "admin"
  );
  const withdrawalResolution = resolveEvidenceServiceResult("withdrawal", deleteResult);
  if (!withdrawalResolution.ok) {
    return NextResponse.json(withdrawalResolution.error.body, { status: withdrawalResolution.error.status });
  }
  const readyWithdrawal = withdrawalResolution.value;

  await recordAuditEvent({
    action: readyWithdrawal.idempotent ? "evidence.withdrawal_retried" : "evidence.withdrawn",
    resourceType: "report_batch_department",
    resourceId: readyWithdrawal.department.id,
    actorRole: "admin",
    metadata: { department: dept, evidenceVersionId, reason, idempotent: readyWithdrawal.idempotent }
  });

  return NextResponse.json({
    ok: true,
    department: readyWithdrawal.department,
    evidenceVersionId: readyWithdrawal.evidenceVersionId,
    undoUntil: readyWithdrawal.undoUntil
  });
}
