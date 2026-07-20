export function buildEvidenceObjectPath(input: {
  batchId: string;
  departmentId: string;
  filename: string;
  now: number;
  randomId: string;
  sanitizeFilename: (value: string) => string;
}) {
  const fileExt = input.filename.includes(".")
    ? input.filename.split(".").pop()?.toLowerCase() || ""
    : "";
  const safeFileName = input.sanitizeFilename(input.filename.replace(/\.[^.]+$/, "")) || "evidence";
  return `${input.batchId}/${input.departmentId}/${input.now}-${input.randomId}-${safeFileName}${fileExt ? `.${fileExt}` : ""}`;
}

export function validateEvidenceObjectPath(input: {
  batchId: string;
  departmentId?: string;
  objectPath: string;
}) {
  if (!input.objectPath.startsWith(`${input.batchId}/`)) {
    return "ตำแหน่งไฟล์หลักฐานไม่ถูกต้อง";
  }
  if (input.departmentId && !input.objectPath.startsWith(`${input.batchId}/${input.departmentId}/`)) {
    return "ไฟล์หลักฐานไม่ตรงกับฝ่ายที่เลือก";
  }
  return null;
}

export function buildEvidenceUploadIntent(input: {
  departmentId: string;
  objectPath: string;
  filename: string;
  contentType: string;
  size: number;
  now: number;
}) {
  return {
    report_batch_department_id: input.departmentId,
    object_path: input.objectPath,
    original_filename: input.filename.trim() || "evidence",
    content_type: input.contentType,
    expected_size_bytes: input.size,
    expires_at: new Date(input.now + 15 * 60 * 1000).toISOString()
  };
}

function sanitizeDownloadFilenameSegment(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
}

export function buildEvidenceDownloadFilename(input: {
  reportDate: string;
  departmentName: string;
  objectPath: string;
}) {
  const originalExt = input.objectPath.includes(".") ? `.${input.objectPath.split(".").pop()}` : "";
  return `evidence-${input.reportDate}-${sanitizeDownloadFilenameSegment(input.departmentName)}${originalExt}`;
}
