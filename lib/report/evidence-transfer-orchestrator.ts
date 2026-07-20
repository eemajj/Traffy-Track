import {
  buildEvidenceDownloadFilename,
  buildEvidenceObjectPath,
  buildEvidenceUploadIntent,
  validateEvidenceObjectPath
} from "./evidence-transfer-core.ts";
import type { EvidenceReviewStatus, ReportBatchRow } from "./types.ts";

export type TransferError = { message: string; code?: string };
export type TransferResult<T> = { data: T | null; error: TransferError | null };

type TransferDepartment = {
  id: string;
  dept_name: string;
  evidence_file_url: string | null;
  evidence_uploaded_at: string | null;
};

type TransferProjection = TransferDepartment & {
  current_evidence_version_id?: string | null;
  evidence_review_status?: EvidenceReviewStatus | null;
  evidence_review_note?: string | null;
  evidence_version_number?: number | null;
  evidence_original_filename?: string | null;
  evidence_sha256?: string | null;
};

export type EvidenceUploadTarget = {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
  supabaseUrl: string;
  anonKey: string;
};

export type EvidenceTransferDependencies = {
  hasAdminEnv: () => boolean;
  now: () => number;
  randomId: () => string;
  sanitizeFilename: (value: string) => string;
  validateUpload: (input: { contentType: string; size: number }) => string | null;
  loadBatch: (batchId: string) => Promise<TransferResult<ReportBatchRow>>;
  loadDepartment: (batchId: string, deptName: string) => Promise<TransferResult<TransferDepartment>>;
  createUploadTarget: (objectPath: string) => Promise<EvidenceUploadTarget>;
  insertUploadIntent: (intent: ReturnType<typeof buildEvidenceUploadIntent>) => Promise<TransferResult<unknown>>;
  downloadEvidence: (objectPath: string) => Promise<TransferResult<{ blob: unknown; size: number }>>;
  inspectEvidence: (blob: unknown) => Promise<{ contentType: string; sha256: string }>;
  attachVersion: (input: {
    departmentId: string;
    objectPath: string;
    size: number;
    contentType: string;
    sha256: string;
    actorRole: "admin" | "operator";
  }) => Promise<TransferResult<{ id: string; idempotent?: boolean }>>;
  enqueueDeletion: (objectPath: string, reason: string) => Promise<void>;
  loadProjection: (departmentId: string) => Promise<TransferResult<TransferProjection>>;
  createSignedDownload: (input: {
    objectPath: string;
    filename: string;
    expiresIn: number;
  }) => Promise<TransferResult<{ signedUrl: string }>>;
};

export function createEvidenceTransferService(deps: EvidenceTransferDependencies) {
  return {
    async createUpload(input: {
      batchId: string;
      deptName: string;
      filename: string;
      contentType: string;
      size: number;
    }) {
      if (!deps.hasAdminEnv()) return { status: "missing_env" as const };
      const validationMessage = deps.validateUpload(input);
      if (validationMessage) return { status: "invalid_file" as const, message: validationMessage };

      try {
        const [batchResult, departmentResult] = await Promise.all([
          deps.loadBatch(input.batchId),
          deps.loadDepartment(input.batchId, input.deptName)
        ]);
        if (batchResult.error) {
          throw new Error(`โหลดรอบรายงานสำหรับอัปโหลดหลักฐานไม่สำเร็จ: ${batchResult.error.message}`);
        }
        if (!batchResult.data) return { status: "not_found" as const };
        if (departmentResult.error) {
          throw new Error(`โหลดฝ่ายสำหรับอัปโหลดหลักฐานไม่สำเร็จ: ${departmentResult.error.message}`);
        }
        if (!departmentResult.data) return { status: "not_found" as const };

        const now = deps.now();
        const objectPath = buildEvidenceObjectPath({
          batchId: input.batchId,
          departmentId: departmentResult.data.id,
          filename: input.filename,
          now,
          randomId: deps.randomId(),
          sanitizeFilename: deps.sanitizeFilename
        });
        const uploadTarget = await deps.createUploadTarget(objectPath);
        const intentResult = await deps.insertUploadIntent(buildEvidenceUploadIntent({
          departmentId: departmentResult.data.id,
          objectPath,
          filename: input.filename,
          contentType: input.contentType,
          size: input.size,
          now
        }));
        if (intentResult.error) throw new Error(`บันทึก upload intent ไม่สำเร็จ: ${intentResult.error.message}`);

        return {
          status: "ready" as const,
          batch: batchResult.data,
          department: departmentResult.data,
          upload: uploadTarget
        };
      } catch (error) {
        return {
          status: "unavailable" as const,
          message: error instanceof Error ? error.message : "ระบบเตรียมอัปโหลดหลักฐานยังไม่พร้อมใช้งานชั่วคราว"
        };
      }
    },

    async attach(input: {
      batchId: string;
      deptName: string;
      objectPath: string;
      actorRole: "admin" | "operator";
    }) {
      if (!deps.hasAdminEnv()) return { status: "missing_env" as const };
      const batchPathError = validateEvidenceObjectPath(input);
      if (batchPathError) return { status: "invalid_file" as const, message: batchPathError };

      try {
        const [batchResult, departmentResult] = await Promise.all([
          deps.loadBatch(input.batchId),
          deps.loadDepartment(input.batchId, input.deptName)
        ]);
        if (batchResult.error) {
          throw new Error(`โหลดรอบรายงานสำหรับบันทึกหลักฐานไม่สำเร็จ: ${batchResult.error.message}`);
        }
        if (!batchResult.data) return { status: "not_found" as const };
        if (departmentResult.error) {
          throw new Error(`โหลดฝ่ายสำหรับบันทึกหลักฐานไม่สำเร็จ: ${departmentResult.error.message}`);
        }
        if (!departmentResult.data) return { status: "not_found" as const };

        const departmentPathError = validateEvidenceObjectPath({
          batchId: input.batchId,
          departmentId: departmentResult.data.id,
          objectPath: input.objectPath
        });
        if (departmentPathError) return { status: "invalid_file" as const, message: departmentPathError };

        const fileResult = await deps.downloadEvidence(input.objectPath);
        if (fileResult.error) {
          throw new Error(`ตรวจสอบไฟล์หลักฐานไม่สำเร็จ: ${fileResult.error.message}`);
        }
        if (!fileResult.data) {
          await deps.enqueueDeletion(input.objectPath, "evidence_verification_missing_blob");
          throw new Error("ตรวจสอบไฟล์หลักฐานไม่สำเร็จ: ไม่พบข้อมูลไฟล์");
        }

        const inspected = await deps.inspectEvidence(fileResult.data.blob);
        const attachResult = await deps.attachVersion({
          departmentId: departmentResult.data.id,
          objectPath: input.objectPath,
          size: fileResult.data.size,
          contentType: inspected.contentType,
          sha256: inspected.sha256,
          actorRole: input.actorRole
        });
        if (attachResult.error) {
          await deps.enqueueDeletion(input.objectPath, "evidence_attach_failed");
          throw new Error(`บันทึกเวอร์ชันหลักฐานไม่สำเร็จ: ${attachResult.error.message}`);
        }
        if (!attachResult.data) throw new Error("บันทึกเวอร์ชันหลักฐานไม่สำเร็จ: ไม่พบข้อมูลเวอร์ชัน");

        const projectionResult = await deps.loadProjection(departmentResult.data.id);
        if (projectionResult.error) {
          throw new Error(`โหลดสถานะหลักฐานล่าสุดหลังอัปโหลดไม่สำเร็จ: ${projectionResult.error.message}`);
        }
        if (!projectionResult.data) return { status: "not_found" as const };
        const projection = projectionResult.data;

        return {
          status: "ready" as const,
          evidenceVersionId: attachResult.data.id,
          idempotent: attachResult.data.idempotent === true,
          isCurrentVersion: projection.current_evidence_version_id === attachResult.data.id,
          batch: batchResult.data,
          department: {
            id: projection.id,
            dept_name: projection.dept_name,
            evidence_file_url: projection.evidence_file_url,
            evidence_uploaded_at: projection.evidence_uploaded_at,
            current_evidence_version_id: projection.current_evidence_version_id || null,
            evidence_review_status: projection.evidence_review_status || null,
            evidence_review_note: projection.evidence_review_note || null,
            evidence_version_number: projection.evidence_version_number || null,
            evidence_original_filename: projection.evidence_original_filename || null,
            evidence_sha256: projection.evidence_sha256 || null
          }
        };
      } catch (error) {
        return {
          status: "unavailable" as const,
          message: error instanceof Error ? error.message : "ระบบอัปโหลดหลักฐานยังไม่พร้อมใช้งานชั่วคราว"
        };
      }
    },

    async download(batchId: string, deptName: string) {
      if (!deps.hasAdminEnv()) return { status: "missing_env" as const };
      try {
        const [batchResult, departmentResult] = await Promise.all([
          deps.loadBatch(batchId),
          deps.loadDepartment(batchId, deptName)
        ]);
        if (batchResult.error) {
          throw new Error(`โหลดรอบรายงานสำหรับดาวน์โหลดหลักฐานไม่สำเร็จ: ${batchResult.error.message}`);
        }
        if (!batchResult.data) return { status: "not_found" as const };
        if (departmentResult.error) {
          throw new Error(`โหลดฝ่ายสำหรับดาวน์โหลดหลักฐานไม่สำเร็จ: ${departmentResult.error.message}`);
        }
        if (!departmentResult.data) return { status: "not_found" as const };
        if (!departmentResult.data.evidence_file_url) return { status: "no_file" as const };

        const filename = buildEvidenceDownloadFilename({
          reportDate: batchResult.data.report_date,
          departmentName: departmentResult.data.dept_name,
          objectPath: departmentResult.data.evidence_file_url
        });
        const signedResult = await deps.createSignedDownload({
          objectPath: departmentResult.data.evidence_file_url,
          filename,
          expiresIn: 10 * 60
        });
        if (signedResult.error || !signedResult.data?.signedUrl) {
          throw new Error(`สร้างลิงก์ดาวน์โหลดหลักฐานไม่สำเร็จ: ${signedResult.error?.message || "ไม่ทราบสาเหตุ"}`);
        }

        return {
          status: "ready" as const,
          batch: batchResult.data,
          department: {
            dept_name: departmentResult.data.dept_name,
            evidence_file_url: departmentResult.data.evidence_file_url,
            evidence_uploaded_at: departmentResult.data.evidence_uploaded_at
          },
          filename,
          signedUrl: signedResult.data.signedUrl
        };
      } catch (error) {
        return {
          status: "unavailable" as const,
          message: error instanceof Error ? error.message : "ระบบดาวน์โหลดหลักฐานยังไม่พร้อมใช้งานชั่วคราว"
        };
      }
    }
  };
}
