export type EvidenceOperation =
  | "download"
  | "create-upload"
  | "complete-upload"
  | "review"
  | "withdrawal"
  | "undo-withdrawal";

type EvidenceServiceResult = {
  status: string;
  message?: string;
};

export type EvidenceErrorResponse = {
  status: number;
  body: {
    error: string;
    code?: string;
  };
};

export type EvidenceServiceResolution<T extends EvidenceServiceResult> =
  | { ok: true; value: Extract<T, { status: "ready" }> }
  | { ok: false; error: EvidenceErrorResponse };

export function resolveEvidenceServiceResult<T extends EvidenceServiceResult>(
  operation: EvidenceOperation,
  result: T
): EvidenceServiceResolution<T> {
  if (result.status === "ready") {
    return { ok: true, value: result as Extract<T, { status: "ready" }> };
  }

  let error: EvidenceErrorResponse;

  if (result.status === "missing_env") {
    error = { status: 500, body: { error: "ระบบยังไม่ได้ตั้งค่า Supabase" } };
  } else if (result.status === "not_found") {
    error = { status: 404, body: { error: "ไม่พบรอบรายงานหรือฝ่ายที่เลือก" } };
  } else if (result.status === "unavailable") {
    error = { status: 500, body: { error: result.message || "ระบบหลักฐานยังไม่พร้อมใช้งานชั่วคราว" } };
  } else if (result.status === "no_file" && (operation === "download" || operation === "withdrawal")) {
    error = { status: 404, body: { error: "ฝ่ายนี้ยังไม่มีไฟล์หลักฐาน" } };
  } else if (result.status === "invalid_file" && (operation === "create-upload" || operation === "complete-upload")) {
    error = { status: 400, body: { error: result.message || "ไฟล์หลักฐานไม่ถูกต้อง" } };
  } else if (result.status === "invalid" && operation === "review") {
    error = {
      status: 400,
      body: { error: result.message || "ผลการตรวจหลักฐานไม่ถูกต้อง", code: "invalid_evidence_review" }
    };
  } else if (result.status === "invalid" && operation === "withdrawal") {
    error = {
      status: 400,
      body: { error: result.message || "คำขอถอนหลักฐานไม่ถูกต้อง", code: "invalid_evidence_withdrawal" }
    };
  } else if (result.status === "conflict") {
    error = {
      status: 409,
      body: {
        error: result.message || "ข้อมูลหลักฐานมีการเปลี่ยนแปลงแล้ว",
        ...(operation === "review" || operation === "withdrawal" ? { code: "stale_evidence_version" } : {})
      }
    };
  } else {
    error = { status: 500, body: { error: "ระบบหลักฐานยังไม่พร้อมใช้งานชั่วคราว" } };
  }

  return { ok: false, error };
}
