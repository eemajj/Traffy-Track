export type ImportResult = {
  filename: string;
  totalRows: number;
  processedRows: number;
  duplicateRows: number;
  newTickets: number;
  reopenedTickets: number;
  changedTickets: number;
  unchangedTickets: number;
  changedFields: number;
  importBatchId: string;
  status?: "queued" | "running" | "completed" | "failed";
  errorMessage?: string | null;
  attemptCount?: number;
  maxAttempts?: number;
  nextAttemptAt?: string | null;
  heartbeatAt?: string | null;
  importedAt?: string;
  completedAt?: string | null;
  processingPhase?: "staging" | "finalizing" | null;
};

export type ImportPreview = {
  filename: string;
  bytesRead: number;
  fileSize: number | null;
  sampledRows: number;
  estimatedRows: number | null;
  headers: string[];
  mappedColumns: Record<string, string>;
  missingRequiredColumns: string[];
  missingOptionalColumns: string[];
  blankTicketIdRows: number;
  duplicateTicketIdRows: number;
  invalidTimestampRows: number;
  invalidCoordsRows: number;
  invalidStarRows: number;
  missingCoordinateRows: number;
  invalidStateRows: number;
  blankOrgResponseRows: number;
  sampledExistingTicketRows: number;
  sampledNewTicketRows: number;
  sampledChangedTicketRows: number;
  dataQualitySignals: {
    semanticDuplicateGroupCount: number;
    semanticDuplicateTicketCount: number;
    semanticDuplicateExamples: Array<{ ticketIds: string[]; reason: string }>;
    departmentSuggestionCount: number;
    departmentSuggestionExamples: Array<{ ticketId: string; category: string; matchedKeywords: string[] }>;
    urgentAttentionCount: number;
    reviewAttentionCount: number;
    attentionExamples: Array<{
      ticketId: string;
      level: "urgent" | "review";
      label: string;
      matchedKeywords: string[];
    }>;
  };
  parseWarnings: string[];
  canImport: boolean;
};

export type RequestState = "idle" | "uploading" | "success" | "error";
export type ImportStage =
  | "idle"
  | "preparing"
  | "uploading"
  | "previewing"
  | "ready"
  | "queued"
  | "retrying"
  | "processing"
  | "finishing"
  | "success"
  | "error";

export type ImportUploadTarget = {
  bucket: string;
  path: string;
  token: string;
  supabaseUrl: string;
  anonKey: string;
};

export function formatImportStateLabel(state: RequestState, stage?: ImportStage) {
  switch (state) {
    case "uploading":
      return "กำลังนำเข้าและตรวจรายการเปลี่ยนแปลง...";
    case "success":
      return "นำเข้าข้อมูลสำเร็จ";
    case "error":
      return "เกิดข้อผิดพลาด";
    default:
      if (stage === "ready") return "ตรวจไฟล์แล้ว รอยืนยันนำเข้า";
      if (stage === "error") return "ไฟล์ต้องแก้ไขก่อนนำเข้า";
      return "ยังไม่ได้อัปโหลด";
  }
}

export function formatImportStageLabel(stage: ImportStage) {
  const labels: Record<ImportStage, string> = {
    idle: "รอเลือกไฟล์",
    preparing: "เตรียมไฟล์และตรวจรูปแบบเบื้องต้น",
    uploading: "กำลังส่งไฟล์ขึ้นพื้นที่เก็บไฟล์ชั่วคราว",
    previewing: "กำลังตรวจไฟล์ตัวอย่างก่อนนำเข้า",
    ready: "ตรวจไฟล์เบื้องต้นแล้ว พร้อมยืนยันนำเข้า",
    queued: "ส่งงานเข้าคิวแล้ว กำลังรอหน่วยประมวลผล",
    retrying: "ระบบพักงานชั่วคราวและจะลองประมวลผลอีกครั้ง",
    processing: "กำลังอ่านและเตรียมข้อมูลในพื้นที่พักก่อนบันทึกจริง",
    finishing: "กำลังตรวจสอบและบันทึกข้อมูลชุดนี้แบบ atomic",
    success: "นำเข้าข้อมูลสำเร็จ",
    error: "หยุดเพราะพบข้อผิดพลาด"
  };

  return labels[stage];
}

export function formatImportDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok"
  }).format(new Date(value));
}

export function formatImportNumber(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

export function formatImportBytes(value: number | null | undefined) {
  if (!value || value <= 0) return "-";

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1
  }).format(size)} ${units[unitIndex]}`;
}

export function formatImportColumnList(columns: string[]) {
  return columns.length === 0 ? "-" : columns.join(", ");
}

export function formatImportSubmitLabel(input: {
  requestState: RequestState;
  importStage: ImportStage;
  preview: ImportPreview | null;
}) {
  if (input.requestState === "uploading") {
    return input.importStage === "previewing" || input.importStage === "uploading" || input.importStage === "preparing"
      ? "กำลังตรวจไฟล์..."
      : "กำลังนำเข้า...";
  }
  if (!input.preview) return "ตรวจไฟล์ก่อนนำเข้า";
  return input.preview.canImport ? "ยืนยันนำเข้า" : "แก้ไฟล์ก่อนนำเข้า";
}

export function formatImportJobStatus(job: ImportResult) {
  switch (job.status) {
    case "queued": return (job.attemptCount || 0) > 0 ? "รอลองใหม่" : "รอประมวลผล";
    case "running":
      if (job.processingPhase === "finalizing") return "กำลังบันทึกขั้นสุดท้าย";
      if (job.processingPhase === "staging") return "กำลังเตรียมข้อมูล";
      return (job.attemptCount || 0) > 1 ? "กำลังลองใหม่" : "กำลังประมวลผล";
    case "failed": return "ไม่สำเร็จ";
    default: return "สำเร็จ";
  }
}

export function getImportJobStage(job: ImportResult): ImportStage {
  if (job.status === "queued") return (job.attemptCount || 0) > 0 ? "retrying" : "queued";
  if (job.status === "running") return job.processingPhase === "finalizing" ? "finishing" : "processing";
  if (job.status === "failed") return "error";
  return job.status === "completed" ? "success" : "error";
}

export function formatImportAttempt(job: ImportResult) {
  const attemptCount = job.attemptCount || 0;
  const maxAttempts = job.maxAttempts || 0;
  if (maxAttempts <= 0) return null;
  if (attemptCount <= 0) return `ยังไม่เริ่มประมวลผล (สูงสุด ${formatImportNumber(maxAttempts)} ครั้ง)`;
  return `ครั้งที่ ${formatImportNumber(attemptCount)} จาก ${formatImportNumber(maxAttempts)}`;
}

export function formatImportJobHistoryNote(job: ImportResult) {
  if (job.errorMessage) {
    const attempt = formatImportAttempt(job);
    return attempt ? `${job.errorMessage} · ${attempt}` : job.errorMessage;
  }

  if (job.status === "completed" || !job.status) {
    if (job.totalRows > 0 && job.processedRows === 0) {
      const duplicateNote = job.duplicateRows > 0
        ? ` · ข้ามซ้ำ ${formatImportNumber(job.duplicateRows)} แถว`
        : "";
      return `รอบข้อมูลเดิมไม่มีการบันทึกจำนวนเรื่องที่ประมวลผล${duplicateNote}`;
    }

    return `ประมวลผล ${formatImportNumber(job.processedRows)} เรื่อง, ข้ามซ้ำ ${formatImportNumber(job.duplicateRows)} แถว`;
  }

  return formatImportAttempt(job) || "กำลังรอสถานะล่าสุด";
}

export function getImportJobStatusClass(job: ImportResult) {
  switch (job.status) {
    case "queued": return "bg-brand/10 text-brand";
    case "running": return "bg-warning/10 text-warning";
    case "failed": return "bg-danger/10 text-danger";
    default: return "bg-success/10 text-success";
  }
}

export function getImportPreviewWarnings(preview: ImportPreview | null) {
  if (!preview) return [];

  const warnings: string[] = [];
  if (preview.missingOptionalColumns.length > 0) {
    warnings.push(
      `ไม่พบคอลัมน์เสริม: ${formatImportColumnList(preview.missingOptionalColumns)} ระบบยังนำเข้าได้ โดยเรื่องเดิมจะเก็บค่าเดิมไว้ ส่วนเรื่องใหม่จะไม่มีค่าในช่องเหล่านี้`
    );
  }
  if (preview.blankTicketIdRows > 0) warnings.push(`พบแถวที่ไม่มี ticket_id ในตัวอย่าง ${formatImportNumber(preview.blankTicketIdRows)} แถว`);
  if (preview.duplicateTicketIdRows > 0) warnings.push(`พบ ticket_id ซ้ำในตัวอย่าง ${formatImportNumber(preview.duplicateTicketIdRows)} แถว ระบบจะใช้รายการแรกและข้ามรายการซ้ำ`);
  if (preview.invalidTimestampRows > 0) warnings.push(`พบวันที่/เวลาที่อ่านไม่ได้ในตัวอย่าง ${formatImportNumber(preview.invalidTimestampRows)} แถว`);
  if (preview.invalidCoordsRows > 0) warnings.push(`พบพิกัดที่อ่านไม่ได้ในตัวอย่าง ${formatImportNumber(preview.invalidCoordsRows)} แถว`);
  if (preview.invalidStarRows > 0) warnings.push(`พบคะแนนที่ไม่ใช่จำนวนเต็มในตัวอย่าง ${formatImportNumber(preview.invalidStarRows)} แถว`);
  if (preview.missingCoordinateRows > 0) warnings.push(`ไม่มีพิกัดในตัวอย่าง ${formatImportNumber(preview.missingCoordinateRows)} แถว จุดเหล่านี้จะไม่ปรากฏบนแผนที่`);
  if (preview.invalidStateRows > 0) warnings.push(`ไม่มีสถานะในตัวอย่าง ${formatImportNumber(preview.invalidStateRows)} แถว ควรตรวจสอบก่อนนำเข้า`);
  if (preview.blankOrgResponseRows > 0) warnings.push(`ไม่มีหน่วยงาน/ฝ่ายในตัวอย่าง ${formatImportNumber(preview.blankOrgResponseRows)} แถว`);

  return [...warnings, ...preview.parseWarnings];
}
