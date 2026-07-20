export type EvidenceActorRole = "admin" | "operator";

export type EvidenceMutationError = {
  message: string;
  code?: string;
};

export type EvidenceMutationResult<T> = {
  data: T | null;
  error: EvidenceMutationError | null;
};

type EvidenceDepartment = {
  id: string;
  dept_name: string;
};

export type EvidenceProjection = EvidenceDepartment & {
  evidence_file_url: string | null;
  evidence_uploaded_at: string | null;
  current_evidence_version_id: string | null;
  evidence_review_status: string | null;
  evidence_review_note: string | null;
  evidence_version_number: number | null;
  evidence_original_filename: string | null;
};

export type ReportDepartmentEvidenceDeleteData =
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | { status: "invalid"; message: string }
  | { status: "conflict"; message: string }
  | { status: "not_found" }
  | { status: "no_file" }
  | {
      status: "ready";
      idempotent: boolean;
      evidenceVersionId: string;
      undoUntil: string | null;
      department: EvidenceDepartment & {
        evidence_file_url: null;
        evidence_uploaded_at: null;
      };
    };

export type EvidenceMutationDependencies = {
  hasAdminEnv: () => boolean;
  loadBatch: (batchId: string) => Promise<EvidenceMutationResult<{ id: string }>>;
  loadDepartment: (batchId: string, deptName: string) => Promise<EvidenceMutationResult<EvidenceDepartment>>;
  withdrawEvidence: (input: {
    departmentId: string;
    evidenceVersionId: string;
    actorRole: EvidenceActorRole;
    reason: string;
  }) => Promise<EvidenceMutationResult<{ idempotent?: boolean; objectPath?: string }>>;
  loadUndoDeadline: (objectPath: string) => Promise<EvidenceMutationResult<{ next_attempt_at: string | null }>>;
  undoWithdrawal: (input: {
    departmentId: string;
    evidenceVersionId: string;
  }) => Promise<EvidenceMutationResult<unknown>>;
  loadProjection: (departmentId: string) => Promise<EvidenceMutationResult<EvidenceProjection>>;
  reviewEvidence: (input: {
    departmentId: string;
    evidenceVersionId: string;
    decision: "approved" | "rejected";
    note: string | null;
    actorRole: "admin";
  }) => Promise<EvidenceMutationResult<{ idempotent?: boolean }>>;
};

export function createEvidenceMutationService(deps: EvidenceMutationDependencies) {
  return {
    async withdraw(
      batchId: string,
      deptName: string,
      evidenceVersionId: string,
      reason: string,
      actorRole: EvidenceActorRole
    ): Promise<ReportDepartmentEvidenceDeleteData> {
      if (!deps.hasAdminEnv()) return { status: "missing_env" };

      try {
        const [batchResult, departmentResult] = await Promise.all([
          deps.loadBatch(batchId),
          deps.loadDepartment(batchId, deptName)
        ]);

        if (batchResult.error) {
          throw new Error(`โหลดรอบรายงานสำหรับลบหลักฐานไม่สำเร็จ: ${batchResult.error.message}`);
        }
        if (!batchResult.data) return { status: "not_found" };
        if (departmentResult.error) {
          throw new Error(`โหลดฝ่ายสำหรับลบหลักฐานไม่สำเร็จ: ${departmentResult.error.message}`);
        }
        if (!departmentResult.data) return { status: "not_found" };

        const withdrawResult = await deps.withdrawEvidence({
          departmentId: departmentResult.data.id,
          evidenceVersionId,
          actorRole,
          reason
        });
        if (withdrawResult.error?.code === "PT409") {
          return { status: "conflict", message: withdrawResult.error.message };
        }
        if (withdrawResult.error?.code === "PT400") {
          return { status: "invalid", message: withdrawResult.error.message };
        }
        if (withdrawResult.error) {
          throw new Error(`ถอนหลักฐานไม่สำเร็จ: ${withdrawResult.error.message}`);
        }

        const withdrawal = withdrawResult.data;
        const undoResult = withdrawal?.objectPath
          ? await deps.loadUndoDeadline(withdrawal.objectPath)
          : null;

        return {
          status: "ready",
          idempotent: withdrawal?.idempotent === true,
          evidenceVersionId,
          undoUntil: undoResult?.data?.next_attempt_at || null,
          department: {
            id: departmentResult.data.id,
            dept_name: departmentResult.data.dept_name,
            evidence_file_url: null,
            evidence_uploaded_at: null
          }
        };
      } catch (error) {
        return {
          status: "unavailable",
          message: error instanceof Error ? error.message : "ระบบลบหลักฐานยังไม่พร้อมใช้งานชั่วคราว"
        };
      }
    },

    async undo(input: { batchId: string; deptName: string; evidenceVersionId: string }) {
      if (!deps.hasAdminEnv()) return { status: "missing_env" as const };

      try {
        const department = await deps.loadDepartment(input.batchId, input.deptName);
        if (department.error) throw department.error;
        if (!department.data) return { status: "not_found" as const };

        const result = await deps.undoWithdrawal({
          departmentId: department.data.id,
          evidenceVersionId: input.evidenceVersionId
        });
        if (result.error?.code === "PT409") {
          return { status: "conflict" as const, message: result.error.message };
        }
        if (result.error) throw result.error;

        const projection = await deps.loadProjection(department.data.id);
        if (projection.error) throw projection.error;
        if (!projection.data) throw new Error("ไม่พบข้อมูลหลักฐานหลังยกเลิกการถอน");
        return { status: "ready" as const, department: projection.data };
      } catch (error) {
        return {
          status: "unavailable" as const,
          message: error instanceof Error ? error.message : "ยกเลิกการถอนหลักฐานไม่สำเร็จ"
        };
      }
    },

    async review(input: {
      batchId: string;
      deptName: string;
      evidenceVersionId: string;
      decision: "approved" | "rejected";
      note: string | null;
      actorRole: "admin";
    }) {
      if (!deps.hasAdminEnv()) return { status: "missing_env" as const };

      try {
        const departmentResult = await deps.loadDepartment(input.batchId, input.deptName);
        if (departmentResult.error) {
          throw new Error(`โหลดฝ่ายสำหรับตรวจหลักฐานไม่สำเร็จ: ${departmentResult.error.message}`);
        }
        if (!departmentResult.data) return { status: "not_found" as const };

        const reviewResult = await deps.reviewEvidence({
          departmentId: departmentResult.data.id,
          evidenceVersionId: input.evidenceVersionId,
          decision: input.decision,
          note: input.note,
          actorRole: input.actorRole
        });
        if (reviewResult.error?.code === "PT409") {
          return { status: "conflict" as const, message: reviewResult.error.message };
        }
        if (reviewResult.error?.code === "PT400") {
          return { status: "invalid" as const, message: reviewResult.error.message };
        }
        if (reviewResult.error) {
          throw new Error(`บันทึกผลตรวจหลักฐานไม่สำเร็จ: ${reviewResult.error.message}`);
        }

        return {
          status: "ready" as const,
          idempotent: reviewResult.data?.idempotent === true,
          department: {
            id: departmentResult.data.id,
            dept_name: departmentResult.data.dept_name,
            current_evidence_version_id: input.evidenceVersionId,
            evidence_review_status: input.decision,
            evidence_review_note: input.note
          }
        };
      } catch (error) {
        return {
          status: "unavailable" as const,
          message: error instanceof Error ? error.message : "ระบบตรวจหลักฐานยังไม่พร้อมใช้งานชั่วคราว"
        };
      }
    }
  };
}
