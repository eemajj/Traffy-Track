import { isEvidenceVersionId } from "./evidence-file.ts";

export type EvidenceReviewInput = {
  decision?: unknown;
  evidenceVersionId?: unknown;
  note?: unknown;
};

export type EvidenceWithdrawalInput = {
  dept?: unknown;
  evidenceVersionId?: unknown;
  reason?: unknown;
};

export type EvidenceValidationError = {
  error: string;
  code: string;
};

export function validateEvidenceReviewInput(input: EvidenceReviewInput):
  | {
      value: {
        decision: "approved" | "rejected";
        evidenceVersionId: string;
        note: string;
      };
    }
  | EvidenceValidationError {
  if (input.decision !== "approved" && input.decision !== "rejected") {
    return { error: "ผลการตรวจหลักฐานไม่ถูกต้อง", code: "invalid_evidence_decision" };
  }

  const evidenceVersionId = String(input.evidenceVersionId || "").trim();
  const note = String(input.note || "").trim();

  if (!evidenceVersionId) {
    return { error: "ไม่พบเวอร์ชันหลักฐานที่ต้องการตรวจ", code: "evidence_version_required" };
  }
  if (!isEvidenceVersionId(evidenceVersionId)) {
    return { error: "รหัสเวอร์ชันหลักฐานไม่ถูกต้อง", code: "invalid_evidence_version_id" };
  }
  if (input.decision === "rejected" && note.length < 5) {
    return { error: "กรุณาระบุเหตุผลที่ตีกลับอย่างน้อย 5 ตัวอักษร", code: "rejection_reason_required" };
  }
  if (note.length > 1000) {
    return { error: "เหตุผลหรือหมายเหตุต้องไม่เกิน 1,000 ตัวอักษร", code: "review_note_too_long" };
  }

  return { value: { decision: input.decision, evidenceVersionId, note } };
}

export function validateEvidenceWithdrawalInput(input: EvidenceWithdrawalInput):
  | { value: { dept: string; evidenceVersionId: string; reason: string } }
  | EvidenceValidationError {
  const dept = String(input.dept || "").trim();
  const evidenceVersionId = String(input.evidenceVersionId || "").trim();
  const reason = String(input.reason || "").trim();

  if (!dept) {
    return { error: "ไม่พบชื่อฝ่ายที่ต้องการถอนหลักฐาน", code: "department_required" };
  }
  if (!isEvidenceVersionId(evidenceVersionId)) {
    return { error: "รหัสเวอร์ชันหลักฐานไม่ถูกต้อง", code: "invalid_evidence_version_id" };
  }
  if (reason.length < 5) {
    return { error: "กรุณาระบุเหตุผลที่ถอนหลักฐานอย่างน้อย 5 ตัวอักษร", code: "withdrawal_reason_required" };
  }
  if (reason.length > 1000) {
    return { error: "เหตุผลที่ถอนหลักฐานต้องไม่เกิน 1,000 ตัวอักษร", code: "withdrawal_reason_too_long" };
  }

  return { value: { dept, evidenceVersionId, reason } };
}
