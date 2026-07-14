export type EvidenceWorkflowState = "missing" | "pending_review" | "approved" | "rejected";

export type EvidenceProjection = {
  evidence_file_url?: string | null;
  evidence_review_status?: string | null;
};

export function getEvidenceWorkflowState(department: EvidenceProjection): EvidenceWorkflowState {
  if (!department.evidence_file_url) return "missing";
  if (department.evidence_review_status === "approved") return "approved";
  if (department.evidence_review_status === "rejected") return "rejected";
  return "pending_review";
}

export function summarizeEvidenceDepartments(departments: EvidenceProjection[]) {
  const states = departments.map(getEvidenceWorkflowState);
  const evidenceMissingCount = states.filter((state) => state === "missing").length;
  const evidencePendingReviewCount = states.filter((state) => state === "pending_review").length;
  const evidenceRejectedCount = states.filter((state) => state === "rejected").length;
  const evidenceApprovedCount = states.filter((state) => state === "approved").length;
  const evidenceUploadedCount = departments.length - evidenceMissingCount;
  const evidencePendingCount = departments.length - evidenceApprovedCount;
  const evidenceProgressPercent = departments.length > 0
    ? Math.round((evidenceApprovedCount / departments.length) * 100)
    : 0;

  return {
    evidenceMissingCount,
    evidencePendingReviewCount,
    evidenceRejectedCount,
    evidenceApprovedCount,
    evidenceUploadedCount,
    evidencePendingCount,
    evidenceProgressPercent,
    completionStatus: departments.length > 0 && evidenceApprovedCount === departments.length
      ? "complete" as const
      : "incomplete" as const
  };
}
