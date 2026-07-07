"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { EvidenceUploadForm } from "@/app/report/[batchId]/evidence-upload-form";

type ChecklistDepartment = {
  id: string;
  dept_name: string;
  evidence_file_url: string | null;
  evidence_uploaded_at: string | null;
  itemCount: number;
};

type ReportDepartmentChecklistProps = {
  batchId: string;
  initialDepartments: ChecklistDepartment[];
};

type DepartmentEvidenceStatus = Pick<
  ChecklistDepartment,
  "id" | "dept_name" | "evidence_file_url" | "evidence_uploaded_at"
>;

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
      evidence_uploaded_at: status.evidence_uploaded_at
    };
  });
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function ReportDepartmentChecklist({ batchId, initialDepartments }: ReportDepartmentChecklistProps) {
  const [departments, setDepartments] = useState(initialDepartments);
  const [deletingDepartmentId, setDeletingDepartmentId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    setDepartments(initialDepartments);

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
  }) {
    setDepartments((currentDepartments) =>
      currentDepartments.map((department) =>
        department.id === uploadedDepartment.id
          ? {
              ...department,
              evidence_file_url: uploadedDepartment.evidence_file_url,
              evidence_uploaded_at: uploadedDepartment.evidence_uploaded_at
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

  async function handleDeleteEvidence(department: ChecklistDepartment) {
    setDeleteError(null);
    setDeletingDepartmentId(department.id);

    try {
      const response = await fetch(
        `/api/report/${batchId}/evidence?dept=${encodeURIComponent(department.dept_name)}`,
        {
          method: "DELETE"
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            department?: DepartmentEvidenceStatus;
          }
        | null;

      if (!response.ok) {
        setDeleteError(payload?.error || "ลบหลักฐานไม่สำเร็จ");
        return;
      }

      if (payload?.department) {
        setDepartments((currentDepartments) =>
          currentDepartments.map((currentDepartment) =>
            currentDepartment.id === payload.department?.id
              ? {
                  ...currentDepartment,
                  evidence_file_url: null,
                  evidence_uploaded_at: null
                }
              : currentDepartment
          )
        );
      }

      const statuses = await fetchDepartmentEvidenceStatuses(batchId);
      if (statuses) {
        setDepartments((currentDepartments) => mergeDepartmentEvidenceStatuses(currentDepartments, statuses));
      }
    } finally {
      setDeletingDepartmentId(null);
    }
  }

  return (
    <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
      <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">รายการตรวจรายฝ่าย</h2>
      {deleteError ? <p className="mt-3 text-sm font-medium text-danger">{deleteError}</p> : null}
      <div className="mt-4 space-y-3">
        {departments.map((department) => {
          const hasEvidence = Boolean(department.evidence_file_url);

          return (
            <div key={department.id} className="space-y-3 rounded-3xl border border-border bg-surface/55 p-4">
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
                  {hasEvidence ? (
                    <button
                      type="button"
                      disabled={deletingDepartmentId === department.id}
                      onClick={() => {
                        void handleDeleteEvidence(department);
                      }}
                      className="rounded-full border border-danger/20 bg-danger/5 px-3 py-1.5 text-sm font-semibold text-danger transition hover:-translate-y-0.5 hover:bg-danger/10 hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingDepartmentId === department.id ? "กำลังลบ..." : "ลบหลักฐาน"}
                    </button>
                  ) : null}
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      department.evidence_uploaded_at
                        ? "bg-[rgba(31,122,90,0.12)] text-success"
                        : "bg-[rgba(201,131,34,0.12)] text-warning"
                    }`}
                  >
                    {department.evidence_uploaded_at ? "อัปโหลดหลักฐานแล้ว" : "ยังไม่มีหลักฐาน"}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-sm text-muted">
                    {department.evidence_uploaded_at
                      ? `ล่าสุด ${formatDateTime(department.evidence_uploaded_at)}`
                      : "รออัปโหลดหลักฐาน"}
                  </span>
                </div>
              </div>
              <EvidenceUploadForm
                batchId={batchId}
                deptName={department.dept_name}
                hasEvidence={hasEvidence}
                onUploaded={handleUploaded}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
