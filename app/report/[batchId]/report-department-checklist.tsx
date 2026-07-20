"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EvidenceUploadForm } from "@/app/report/[batchId]/evidence-upload-form";

type ChecklistDepartment = {
  id: string;
  dept_name: string;
  evidence_file_url: string | null;
  evidence_uploaded_at: string | null;
  current_evidence_version_id: string | null;
  evidence_review_status: "pending" | "approved" | "rejected" | "legacy_unverified" | null;
  evidence_review_note: string | null;
  evidence_version_number: number | null;
  evidence_original_filename: string | null;
  itemCount: number;
};

type ReportDepartmentChecklistProps = {
  batchId: string;
  initialDepartments: ChecklistDepartment[];
  canManageEvidence: boolean;
};

type DepartmentEvidenceStatus = Pick<
  ChecklistDepartment,
  "id" | "dept_name" | "evidence_file_url" | "evidence_uploaded_at"
> & Pick<ChecklistDepartment, "current_evidence_version_id" | "evidence_review_status" | "evidence_review_note" | "evidence_version_number" | "evidence_original_filename">;

async function fetchDepartmentEvidenceStatuses(batchId: string) {
  const response = await fetch(`/api/report/${batchId}/departments`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as {
    departments?: DepartmentEvidenceStatus[];
  } | null;

  return payload?.departments || null;
}

function mergeDepartmentEvidenceStatuses(
  departments: ChecklistDepartment[],
  statuses: DepartmentEvidenceStatus[]
) {
  const statusById = new Map(statuses.map((status) => [status.id, status]));

  return departments.map((department) => {
    const status = statusById.get(department.id);

    if (!status) {
      return department;
    }

    return {
      ...department,
      evidence_file_url: status.evidence_file_url,
      evidence_uploaded_at: status.evidence_uploaded_at,
      current_evidence_version_id: status.current_evidence_version_id,
      evidence_review_status: status.evidence_review_status,
      evidence_review_note: status.evidence_review_note,
      evidence_version_number: status.evidence_version_number,
      evidence_original_filename: status.evidence_original_filename
    };
  });
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(new Date(value));
}

function getReviewLabel(status: ChecklistDepartment["evidence_review_status"]) {
  if (status === "approved") return "อนุมัติแล้ว";
  if (status === "rejected") return "ตีกลับ";
  if (status === "legacy_unverified") return "ข้อมูลเดิม—รอยืนยัน";
  return "รอตรวจ";
}

function getReviewClassName(status: ChecklistDepartment["evidence_review_status"]) {
  if (status === "approved") return "bg-success/10 text-success";
  if (status === "rejected") return "bg-danger/10 text-danger";
  return "bg-warning/10 text-warning";
}

export function ReportDepartmentChecklist({ batchId, initialDepartments, canManageEvidence }: ReportDepartmentChecklistProps) {
  const [departments, setDepartments] = useState(initialDepartments);
  const [deletingDepartmentId, setDeletingDepartmentId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [reviewingDepartmentId, setReviewingDepartmentId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [withdrawalDepartmentId, setWithdrawalDepartmentId] = useState<string | null>(null);
  const [withdrawalReasons, setWithdrawalReasons] = useState<Record<string, string>>({});
  const [pendingUndo, setPendingUndo] = useState<{
    departmentId: string;
    departmentName: string;
    evidenceVersionId: string;
    undoUntil: string | null;
  } | null>(null);

  useEffect(() => {
    let isActive = true;

    async function refreshStatuses() {
      const statuses = await fetchDepartmentEvidenceStatuses(batchId);

      if (isActive && statuses) {
        setDepartments((currentDepartments) => mergeDepartmentEvidenceStatuses(currentDepartments, statuses));
      }
    }

    void refreshStatuses();

    return () => {
      isActive = false;
    };
  }, [batchId, initialDepartments]);

  function handleUploaded(uploadedDepartment: {
    id: string;
    dept_name: string;
    evidence_file_url: string;
    evidence_uploaded_at: string;
    current_evidence_version_id?: string;
    evidence_review_status?: ChecklistDepartment["evidence_review_status"];
    evidence_review_note?: string | null;
    evidence_version_number?: number;
    evidence_original_filename?: string;
  }) {
    setDepartments((currentDepartments) =>
      currentDepartments.map((department) =>
        department.id === uploadedDepartment.id
          ? {
              ...department,
              evidence_file_url: uploadedDepartment.evidence_file_url,
              evidence_uploaded_at: uploadedDepartment.evidence_uploaded_at,
              current_evidence_version_id: uploadedDepartment.current_evidence_version_id || null,
              evidence_review_status: uploadedDepartment.evidence_review_status || "pending",
              evidence_review_note: uploadedDepartment.evidence_review_note || null,
              evidence_version_number: uploadedDepartment.evidence_version_number || null,
              evidence_original_filename: uploadedDepartment.evidence_original_filename || null
            }
          : department
      )
    );

    fetchDepartmentEvidenceStatuses(batchId).then((statuses) => {
      if (statuses) {
        setDepartments((currentDepartments) => mergeDepartmentEvidenceStatuses(currentDepartments, statuses));
      }
    });
  }

  async function handleReviewEvidence(
    department: ChecklistDepartment,
    decision: "approved" | "rejected"
  ) {
    const note = (reviewNotes[department.id] || "").trim();
    setStatusMessage(null);
    if (!department.current_evidence_version_id) {
      setDeleteError("ไม่พบเวอร์ชันหลักฐาน กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");
      return;
    }
    if (decision === "rejected" && note.length < 5) {
      setDeleteError("กรุณาระบุเหตุผลที่ตีกลับอย่างน้อย 5 ตัวอักษร");
      return;
    }
    setDeleteError(null);
    setReviewingDepartmentId(department.id);

    try {
      const response = await fetch(`/api/report/${batchId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "review",
          dept: department.dept_name,
          decision,
          evidenceVersionId: department.current_evidence_version_id,
          note: note || null
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setDeleteError(payload?.error || "บันทึกผลตรวจหลักฐานไม่สำเร็จ");
        if (response.status === 409) {
          const statuses = await fetchDepartmentEvidenceStatuses(batchId);
          if (statuses) {
            setDepartments((current) => mergeDepartmentEvidenceStatuses(current, statuses));
          }
        }
        return;
      }

      setDepartments((current) => current.map((item) =>
        item.id === department.id
          ? { ...item, evidence_review_status: decision, evidence_review_note: note || null }
          : item
      ));
      setReviewNotes((current) => ({ ...current, [department.id]: "" }));
      setStatusMessage(decision === "approved" ? `อนุมัติหลักฐานของ ${department.dept_name} แล้ว` : `ตีกลับหลักฐานของ ${department.dept_name} แล้ว`);
    } finally {
      setReviewingDepartmentId(null);
    }
  }

  async function handleDeleteEvidence(department: ChecklistDepartment) {
    const reason = (withdrawalReasons[department.id] || "").trim();
    if (!department.current_evidence_version_id) {
      setDeleteError("ไม่พบเวอร์ชันหลักฐาน กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");
      return;
    }
    if (reason.length < 5) {
      setDeleteError("กรุณาระบุเหตุผลที่ถอนหลักฐานอย่างน้อย 5 ตัวอักษร");
      return;
    }
    setDeleteError(null);
    setStatusMessage(null);
    setDeletingDepartmentId(department.id);

    try {
      const response = await fetch(`/api/report/${batchId}/evidence`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dept: department.dept_name,
          evidenceVersionId: department.current_evidence_version_id,
          reason
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            department?: DepartmentEvidenceStatus;
            evidenceVersionId?: string;
            undoUntil?: string | null;
          }
        | null;

      if (!response.ok) {
        setDeleteError(payload?.error || "ลบหลักฐานไม่สำเร็จ");
        if (response.status === 409) {
          const statuses = await fetchDepartmentEvidenceStatuses(batchId);
          if (statuses) {
            setDepartments((current) => mergeDepartmentEvidenceStatuses(current, statuses));
          }
        }
        return;
      }

      if (payload?.department) {
        setDepartments((currentDepartments) =>
          currentDepartments.map((currentDepartment) =>
            currentDepartment.id === payload.department?.id
              ? {
                  ...currentDepartment,
                  evidence_file_url: null,
                  evidence_uploaded_at: null,
                  current_evidence_version_id: null,
                  evidence_review_status: null,
                  evidence_review_note: null,
                  evidence_version_number: null,
                  evidence_original_filename: null
                }
              : currentDepartment
          )
        );
      }

      const statuses = await fetchDepartmentEvidenceStatuses(batchId);
      if (statuses) {
        setDepartments((currentDepartments) => mergeDepartmentEvidenceStatuses(currentDepartments, statuses));
      }
      setWithdrawalDepartmentId(null);
      setWithdrawalReasons((current) => ({ ...current, [department.id]: "" }));
      if (payload?.evidenceVersionId) {
        setPendingUndo({
          departmentId: department.id,
          departmentName: department.dept_name,
          evidenceVersionId: payload.evidenceVersionId,
          undoUntil: payload.undoUntil || null
        });
      }
      setStatusMessage(`ถอนหลักฐานของ ${department.dept_name} แล้ว ไฟล์จะถูกลบหลังช่วงยกเลิก 15 นาที`);
    } finally {
      setDeletingDepartmentId(null);
    }
  }

  async function handleUndoWithdrawal() {
    if (!pendingUndo) return;
    setDeletingDepartmentId(pendingUndo.departmentId);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/report/${batchId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "undo-withdrawal",
          dept: pendingUndo.departmentName,
          evidenceVersionId: pendingUndo.evidenceVersionId
        })
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        department?: DepartmentEvidenceStatus;
      } | null;
      if (!response.ok) throw new Error(payload?.error || "ยกเลิกการถอนไม่สำเร็จ");
      if (payload?.department) {
        setDepartments((current) => mergeDepartmentEvidenceStatuses(current, [payload.department!]));
      }
      setPendingUndo(null);
      setStatusMessage(`ยกเลิกการถอนหลักฐานของ ${pendingUndo.departmentName} แล้ว`);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "ยกเลิกการถอนไม่สำเร็จ");
    } finally {
      setDeletingDepartmentId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
      <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">รายการตรวจรายฝ่าย</h2>
      <div aria-live="polite" aria-atomic="true">
        {deleteError ? <p className="mt-3 text-sm font-medium text-danger" role="alert">{deleteError}</p> : null}
        {statusMessage ? <p className="mt-3 text-sm font-medium text-success" role="status">{statusMessage}</p> : null}
      </div>
      {pendingUndo ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink">
            ถอนหลักฐานของ {pendingUndo.departmentName} แล้ว
            {pendingUndo.undoUntil ? ` · ยกเลิกได้ถึง ${formatDateTime(pendingUndo.undoUntil)}` : " · ยกเลิกได้ภายใน 15 นาที"}
          </p>
          <button
            type="button"
            onClick={() => void handleUndoWithdrawal()}
            disabled={deletingDepartmentId === pendingUndo.departmentId}
            className="min-h-11 rounded-xl border border-warning bg-white px-4 py-2 text-sm font-semibold text-warning disabled:opacity-60"
          >
            Undo การถอน
          </button>
        </div>
      ) : null}
      <div className="mt-4 space-y-3">
        {departments.map((department) => {
          const hasEvidence = Boolean(department.evidence_file_url);

          return (
            <div key={department.id} className="space-y-3 rounded-2xl border border-border bg-surface/55 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-ink">{department.dept_name}</h3>
                  <p className="text-sm text-muted">{department.itemCount} เรื่องในรอบนี้</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    href={`/api/report/${batchId}/export?dept=${encodeURIComponent(department.dept_name)}`}
                    className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-deep hover:shadow-hover"
                  >
                    ดาวน์โหลด Excel
                  </Link>
                  <Link
                    href={`/api/report/${batchId}/export-pdf?dept=${encodeURIComponent(department.dept_name)}`}
                    className="rounded-full border border-brand/25 bg-white px-3 py-1.5 text-sm font-semibold text-brand transition hover:-translate-y-0.5 hover:bg-brand/5 hover:shadow-hover"
                  >
                    PDF พร้อมพิมพ์
                  </Link>
                  {hasEvidence ? (
                    <Link
                      href={`/api/report/${batchId}/evidence?dept=${encodeURIComponent(department.dept_name)}`}
                      className="rounded-full border border-border bg-white px-3 py-1.5 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-brand/35 hover:text-brand hover:shadow-hover"
                    >
                      ดาวน์โหลดหลักฐาน
                    </Link>
                  ) : null}
                  {hasEvidence && canManageEvidence ? (
                    <button
                      type="button"
                      disabled={deletingDepartmentId === department.id}
                      onClick={() => {
                        setDeleteError(null);
                        setWithdrawalDepartmentId((current) => current === department.id ? null : department.id);
                      }}
                      className="min-h-11 rounded-full border border-danger/20 bg-danger/5 px-4 py-2 text-sm font-semibold text-danger transition hover:-translate-y-0.5 hover:bg-danger/10 hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingDepartmentId === department.id ? "กำลังถอน..." : "ถอนหลักฐาน"}
                    </button>
                  ) : null}
                  {hasEvidence ? (
                    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${getReviewClassName(department.evidence_review_status)}`}>
                      {getReviewLabel(department.evidence_review_status)}
                    </span>
                  ) : null}
                  <span
                    className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-muted"
                  >
                    {department.evidence_uploaded_at ? "มีไฟล์หลักฐาน" : "ยังไม่มีหลักฐาน"}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-sm text-muted">
                    {department.evidence_uploaded_at
                      ? `ล่าสุด ${formatDateTime(department.evidence_uploaded_at)}`
                      : "รออัปโหลดหลักฐาน"}
                  </span>
                </div>
              </div>
              {hasEvidence ? (
                <div className="space-y-3 border-t border-border/70 pt-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted">
                    {department.evidence_version_number ? `เวอร์ชัน ${department.evidence_version_number}` : "หลักฐานเดิม"}
                    {department.evidence_original_filename ? ` · ${department.evidence_original_filename}` : ""}
                  </p>
                  {department.evidence_review_note ? (
                    <p className={department.evidence_review_status === "rejected" ? "text-sm font-medium text-danger" : "text-sm text-muted"}>
                      {department.evidence_review_status === "rejected" ? "เหตุผลที่ตีกลับ: " : "หมายเหตุ: "}
                      {department.evidence_review_note}
                    </p>
                  ) : null}
                  </div>
                  {canManageEvidence && (department.evidence_review_status === "pending" || department.evidence_review_status === "legacy_unverified") ? (
                    <div className="rounded-2xl bg-white p-3" aria-label={`ตรวจหลักฐานของ ${department.dept_name}`}>
                      <label className="block text-sm font-semibold text-ink" htmlFor={`review-note-${department.id}`}>
                        เหตุผลเมื่อตีกลับ <span className="font-normal text-muted">(จำเป็นอย่างน้อย 5 ตัวอักษร)</span>
                      </label>
                      <textarea
                        id={`review-note-${department.id}`}
                        value={reviewNotes[department.id] || ""}
                        onChange={(event) => setReviewNotes((current) => ({ ...current, [department.id]: event.target.value }))}
                        maxLength={1000}
                        rows={2}
                        placeholder="ระบุสิ่งที่ต้องแก้ไข เพื่อให้เจ้าหน้าที่ดำเนินการต่อได้ทันที"
                        className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={reviewingDepartmentId === department.id}
                        onClick={() => void handleReviewEvidence(department, "approved")}
                        className="min-h-11 rounded-xl bg-success px-4 py-2 text-sm font-semibold text-white hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        อนุมัติหลักฐาน
                      </button>
                      <button
                        type="button"
                        disabled={reviewingDepartmentId === department.id || (reviewNotes[department.id] || "").trim().length < 5}
                        onClick={() => void handleReviewEvidence(department, "rejected")}
                        className="min-h-11 rounded-xl border border-danger/30 bg-white px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        ตีกลับ
                      </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {hasEvidence && canManageEvidence && withdrawalDepartmentId === department.id ? (
                <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4" role="group" aria-labelledby={`withdraw-title-${department.id}`}>
                  <h4 id={`withdraw-title-${department.id}`} className="text-sm font-semibold text-danger">
                    ยืนยันถอนหลักฐานเวอร์ชัน {department.evidence_version_number || "ปัจจุบัน"}
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-muted">ระบบจะหยุดใช้ไฟล์นี้ทันที แต่ยังยกเลิกการถอนได้ 15 นาทีก่อนลบไฟล์จริง</p>
                  <label className="mt-3 block text-sm font-semibold text-ink" htmlFor={`withdraw-reason-${department.id}`}>
                    เหตุผลที่ถอน <span className="font-normal text-muted">(อย่างน้อย 5 ตัวอักษร)</span>
                  </label>
                  <textarea
                    id={`withdraw-reason-${department.id}`}
                    value={withdrawalReasons[department.id] || ""}
                    onChange={(event) => setWithdrawalReasons((current) => ({ ...current, [department.id]: event.target.value }))}
                    maxLength={1000}
                    rows={2}
                    className="mt-2 w-full rounded-xl border border-danger/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-danger focus:ring-4 focus:ring-danger/10"
                    placeholder="เช่น อัปโหลดผิดฝ่าย หรือเลือกไฟล์ผิดฉบับ"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={deletingDepartmentId === department.id || (withdrawalReasons[department.id] || "").trim().length < 5}
                      onClick={() => void handleDeleteEvidence(department)}
                      className="min-h-11 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingDepartmentId === department.id ? "กำลังถอน..." : "ยืนยันถอนหลักฐาน"}
                    </button>
                    <button
                      type="button"
                      disabled={deletingDepartmentId === department.id}
                      onClick={() => setWithdrawalDepartmentId(null)}
                      className="min-h-11 rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              ) : null}
              <EvidenceUploadForm
                batchId={batchId}
                deptName={department.dept_name}
                hasEvidence={hasEvidence}
                canAutoApprove={canManageEvidence}
                onUploaded={handleUploaded}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
