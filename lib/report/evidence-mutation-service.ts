import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";
import type { SessionRole } from "@/lib/session";
import {
  createEvidenceMutationService,
  type EvidenceMutationDependencies,
  type EvidenceMutationResult,
  type EvidenceProjection,
  type ReportDepartmentEvidenceDeleteData
} from "@/lib/report/evidence-mutation-core";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function normalizeResult<T>(result: {
  data: unknown;
  error: { message: string; code?: string } | null;
}): EvidenceMutationResult<T> {
  return {
    data: result.data as T | null,
    error: result.error ? { message: result.error.message, code: result.error.code } : null
  };
}

function createRuntimeDependencies(): EvidenceMutationDependencies {
  let client: AdminClient | null = null;
  const getClient = () => {
    client ||= createSupabaseAdminClient();
    return client;
  };

  return {
    hasAdminEnv: hasSupabaseAdminEnv,
    async loadBatch(batchId) {
      const result = await getClient().from("report_batches").select("id").eq("id", batchId).maybeSingle();
      return normalizeResult<{ id: string }>(result);
    },
    async loadDepartment(batchId, deptName) {
      const result = await getClient()
        .from("report_batch_departments")
        .select("id, dept_name")
        .eq("report_batch_id", batchId)
        .eq("dept_name", deptName)
        .maybeSingle();
      return normalizeResult<{ id: string; dept_name: string }>(result);
    },
    async withdrawEvidence(input) {
      const result = await getClient().rpc("withdraw_report_evidence_v2", {
        p_department_id: input.departmentId,
        p_evidence_version_id: input.evidenceVersionId,
        p_actor_role: input.actorRole,
        p_reason: input.reason
      });
      return normalizeResult<{ idempotent?: boolean; objectPath?: string }>(result);
    },
    async loadUndoDeadline(objectPath) {
      const result = await getClient()
        .from("storage_deletion_outbox")
        .select("next_attempt_at")
        .eq("bucket", "report-evidence")
        .eq("object_path", objectPath)
        .eq("reason", "evidence_withdrawn")
        .maybeSingle();
      return normalizeResult<{ next_attempt_at: string | null }>(result);
    },
    async undoWithdrawal(input) {
      const result = await getClient().rpc("undo_report_evidence_withdrawal", {
        p_department_id: input.departmentId,
        p_evidence_version_id: input.evidenceVersionId,
        p_actor_role: "admin"
      });
      return normalizeResult<unknown>(result);
    },
    async loadProjection(departmentId) {
      const result = await getClient()
        .from("report_batch_departments")
        .select(
          "id, dept_name, evidence_file_url, evidence_uploaded_at, current_evidence_version_id, evidence_review_status, evidence_review_note, evidence_version_number, evidence_original_filename"
        )
        .eq("id", departmentId)
        .single();
      return normalizeResult<EvidenceProjection>(result);
    },
    async reviewEvidence(input) {
      const result = await getClient().rpc("review_report_evidence_version_v2", {
        p_department_id: input.departmentId,
        p_evidence_version_id: input.evidenceVersionId,
        p_decision: input.decision,
        p_note: input.note,
        p_actor_role: input.actorRole
      });
      return normalizeResult<{ idempotent?: boolean }>(result);
    }
  };
}

const evidenceMutationService = createEvidenceMutationService(createRuntimeDependencies());

export type { ReportDepartmentEvidenceDeleteData } from "@/lib/report/evidence-mutation-core";

export function deleteReportDepartmentEvidence(
  batchId: string,
  deptName: string,
  evidenceVersionId: string,
  reason: string,
  actorRole: SessionRole
): Promise<ReportDepartmentEvidenceDeleteData> {
  return evidenceMutationService.withdraw(batchId, deptName, evidenceVersionId, reason, actorRole);
}

export function undoReportDepartmentEvidenceWithdrawal(input: {
  batchId: string;
  deptName: string;
  evidenceVersionId: string;
}) {
  return evidenceMutationService.undo(input);
}

export function reviewReportDepartmentEvidence(input: {
  batchId: string;
  deptName: string;
  evidenceVersionId: string;
  decision: "approved" | "rejected";
  note: string | null;
  actorRole: "admin";
}) {
  return evidenceMutationService.review(input);
}
