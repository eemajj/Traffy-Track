import { hasSupabaseAdminEnv } from "@/lib/env";
import {
  inspectEvidenceBlob,
  REPORT_EVIDENCE_ALLOWED_TYPES,
  REPORT_EVIDENCE_MAX_BYTES,
  validateEvidenceUpload
} from "@/lib/report/evidence-file";
import {
  createEvidenceTransferService,
  type EvidenceTransferDependencies,
  type TransferResult
} from "@/lib/report/evidence-transfer-orchestrator";
import type { ReportBatchDepartmentRow, ReportBatchRow, ReportDepartmentEvidenceDownloadData } from "@/lib/report/types";
import type { SessionRole } from "@/lib/session";
import {
  createSignedUploadTarget,
  REPORT_EVIDENCE_BUCKET,
  sanitizeStorageSegment
} from "@/lib/storage";
import { createSupabaseAdminClient } from "@/lib/supabase";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function normalizeResult<T>(result: {
  data: unknown;
  error: { message: string; code?: string } | null;
}): TransferResult<T> {
  return {
    data: result.data as T | null,
    error: result.error ? { message: result.error.message, code: result.error.code } : null
  };
}

function createRuntimeDependencies(): EvidenceTransferDependencies {
  let client: AdminClient | null = null;
  const getClient = () => {
    client ||= createSupabaseAdminClient();
    return client;
  };

  return {
    hasAdminEnv: hasSupabaseAdminEnv,
    now: Date.now,
    randomId: crypto.randomUUID,
    sanitizeFilename: sanitizeStorageSegment,
    validateUpload: validateEvidenceUpload,
    async loadBatch(batchId) {
      const result = await getClient()
        .from("report_batches")
        .select("id, report_date, created_at, note")
        .eq("id", batchId)
        .maybeSingle();
      return normalizeResult<ReportBatchRow>(result);
    },
    async loadDepartment(batchId, deptName) {
      const result = await getClient()
        .from("report_batch_departments")
        .select("id, dept_name, evidence_file_url, evidence_uploaded_at")
        .eq("report_batch_id", batchId)
        .eq("dept_name", deptName)
        .maybeSingle();
      return normalizeResult<{
        id: string;
        dept_name: string;
        evidence_file_url: string | null;
        evidence_uploaded_at: string | null;
      }>(result);
    },
    createUploadTarget(objectPath) {
      return createSignedUploadTarget({
        bucket: REPORT_EVIDENCE_BUCKET,
        path: objectPath,
        fileSizeLimit: REPORT_EVIDENCE_MAX_BYTES,
        allowedMimeTypes: [...REPORT_EVIDENCE_ALLOWED_TYPES]
      });
    },
    async insertUploadIntent(intent) {
      return normalizeResult<unknown>(await getClient().from("report_evidence_upload_intents").insert(intent));
    },
    async downloadEvidence(objectPath) {
      const result = await getClient().storage.from(REPORT_EVIDENCE_BUCKET).download(objectPath);
      return {
        data: result.data ? { blob: result.data, size: result.data.size } : null,
        error: result.error ? { message: result.error.message, code: result.error.name } : null
      };
    },
    inspectEvidence(blob) {
      if (!(blob instanceof Blob)) throw new Error("ข้อมูลไฟล์หลักฐานไม่ถูกต้อง");
      return inspectEvidenceBlob(blob);
    },
    async attachVersion(input) {
      const result = await getClient().rpc("attach_report_evidence_version", {
        p_department_id: input.departmentId,
        p_object_path: input.objectPath,
        p_actual_size_bytes: input.size,
        p_detected_content_type: input.contentType,
        p_sha256: input.sha256,
        p_actor_role: input.actorRole
      });
      return normalizeResult<{ id: string; idempotent?: boolean }>(result);
    },
    async enqueueDeletion(objectPath, reason) {
      const now = new Date().toISOString();
      const result = await getClient().from("storage_deletion_outbox").upsert(
        {
          bucket: REPORT_EVIDENCE_BUCKET,
          object_path: objectPath,
          reason,
          status: "pending",
          next_attempt_at: now,
          updated_at: now,
          last_error: null
        },
        { onConflict: "bucket,object_path" }
      );
      if (result.error) {
        console.error("Failed to enqueue evidence storage deletion", {
          objectPath,
          reason,
          message: result.error.message
        });
      }
    },
    async loadProjection(departmentId) {
      const result = await getClient()
        .from("report_batch_departments")
        .select(
          "id, dept_name, evidence_file_url, evidence_uploaded_at, current_evidence_version_id, evidence_review_status, evidence_review_note, evidence_version_number, evidence_original_filename, evidence_sha256"
        )
        .eq("id", departmentId)
        .maybeSingle();
      return normalizeResult<ReportBatchDepartmentRow>(result);
    },
    async createSignedDownload(input) {
      const result = await getClient().storage
        .from(REPORT_EVIDENCE_BUCKET)
        .createSignedUrl(input.objectPath, input.expiresIn, { download: input.filename });
      return normalizeResult<{ signedUrl: string }>(result);
    }
  };
}

const evidenceTransferService = createEvidenceTransferService(createRuntimeDependencies());

export function createReportDepartmentEvidenceUpload(input: {
  batchId: string;
  deptName: string;
  filename: string;
  contentType: string;
  size: number;
}) {
  return evidenceTransferService.createUpload(input);
}

export function attachReportDepartmentEvidence(input: {
  batchId: string;
  deptName: string;
  objectPath: string;
  actorRole: SessionRole;
}) {
  return evidenceTransferService.attach(input);
}

export function getReportDepartmentEvidenceDownloadData(
  batchId: string,
  deptName: string
): Promise<ReportDepartmentEvidenceDownloadData> {
  return evidenceTransferService.download(batchId, deptName);
}
