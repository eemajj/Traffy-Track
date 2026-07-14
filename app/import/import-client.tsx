"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { DragEvent, useMemo, useRef, useState } from "react";

type ImportResult = {
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
  importedAt?: string;
  completedAt?: string | null;
};

type ImportPreview = {
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

type RequestState = "idle" | "uploading" | "success" | "error";
type ImportStage = "idle" | "preparing" | "uploading" | "previewing" | "ready" | "processing" | "finishing" | "success" | "error";

type ImportUploadTarget = {
  bucket: string;
  path: string;
  token: string;
  supabaseUrl: string;
  anonKey: string;
};

function formatStateLabel(state: RequestState) {
  switch (state) {
    case "uploading":
      return "กำลังนำเข้าและตรวจรายการเปลี่ยนแปลง...";
    case "success":
      return "นำเข้าข้อมูลสำเร็จ";
    case "error":
      return "เกิดข้อผิดพลาด";
    default:
      return "ยังไม่ได้อัปโหลด";
  }
}

function formatStageLabel(stage: ImportStage) {
  const labels: Record<ImportStage, string> = {
    idle: "รอเลือกไฟล์",
    preparing: "เตรียมไฟล์และตรวจรูปแบบเบื้องต้น",
    uploading: "กำลังส่งไฟล์ขึ้นพื้นที่เก็บไฟล์ชั่วคราว",
    previewing: "กำลังตรวจไฟล์ตัวอย่างก่อนนำเข้า",
    ready: "ตรวจไฟล์เบื้องต้นแล้ว พร้อมยืนยันนำเข้า",
    processing: "กำลังอ่านไฟล์ CSV ตรวจรายการเปลี่ยนแปลง และบันทึกลงฐานข้อมูล",
    finishing: "กำลังสรุปผลการนำเข้า",
    success: "นำเข้าข้อมูลสำเร็จ",
    error: "หยุดเพราะพบข้อผิดพลาด"
  };

  return labels[stage];
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function formatBytes(value: number | null | undefined) {
  if (!value || value <= 0) {
    return "-";
  }

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

function formatColumnList(columns: string[]) {
  if (columns.length === 0) {
    return "-";
  }

  return columns.join(", ");
}

function formatSubmitLabel(input: {
  requestState: RequestState;
  importStage: ImportStage;
  preview: ImportPreview | null;
}) {
  if (input.requestState === "uploading") {
    if (input.importStage === "previewing" || input.importStage === "uploading" || input.importStage === "preparing") {
      return "กำลังตรวจไฟล์...";
    }

    return "กำลังนำเข้า...";
  }

  if (!input.preview) {
    return "ตรวจไฟล์ก่อนนำเข้า";
  }

  if (!input.preview.canImport) {
    return "แก้ไฟล์ก่อนนำเข้า";
  }

  return "ยืนยันนำเข้า";
}

function formatJobStatus(job: ImportResult) {
  switch (job.status) {
    case "queued":
      return "รอประมวลผล";
    case "running":
      return "กำลังประมวลผล";
    case "failed":
      return "ไม่สำเร็จ";
    default:
      return "สำเร็จ";
  }
}

function getJobStatusClass(job: ImportResult) {
  switch (job.status) {
    case "queued":
      return "bg-brand/10 text-brand";
    case "running":
      return "bg-warning/10 text-warning";
    case "failed":
      return "bg-danger/10 text-danger";
    default:
      return "bg-success/10 text-success";
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function ImportClient({ initialJobs }: { initialJobs: ImportResult[] }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [importStage, setImportStage] = useState<ImportStage>("idle");
  const [importProgress, setImportProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [recentJobs, setRecentJobs] = useState(initialJobs);
  const [uploadTarget, setUploadTarget] = useState<ImportUploadTarget | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const canSubmit = useMemo(
    () => selectedFile !== null && requestState !== "uploading" && (!preview || preview.canImport),
    [preview, requestState, selectedFile]
  );
  const previewWarnings = useMemo(() => {
    if (!preview) {
      return [];
    }

    const warnings: string[] = [];

    if (preview.missingOptionalColumns.length > 0) {
      warnings.push(
        `ไม่พบคอลัมน์เสริม: ${formatColumnList(preview.missingOptionalColumns)} ระบบยังนำเข้าได้ โดยเรื่องเดิมจะเก็บค่าเดิมไว้ ส่วนเรื่องใหม่จะไม่มีค่าในช่องเหล่านี้`
      );
    }

    if (preview.blankTicketIdRows > 0) {
      warnings.push(`พบแถวที่ไม่มี ticket_id ในตัวอย่าง ${formatNumber(preview.blankTicketIdRows)} แถว`);
    }

    if (preview.duplicateTicketIdRows > 0) {
      warnings.push(`พบ ticket_id ซ้ำในตัวอย่าง ${formatNumber(preview.duplicateTicketIdRows)} แถว ระบบจะใช้รายการแรกและข้ามรายการซ้ำ`);
    }

    if (preview.invalidTimestampRows > 0) {
      warnings.push(`พบวันที่/เวลาที่อ่านไม่ได้ในตัวอย่าง ${formatNumber(preview.invalidTimestampRows)} แถว`);
    }

    if (preview.invalidCoordsRows > 0) {
      warnings.push(`พบพิกัดที่อ่านไม่ได้ในตัวอย่าง ${formatNumber(preview.invalidCoordsRows)} แถว`);
    }

    if (preview.invalidStarRows > 0) {
      warnings.push(`พบคะแนนที่ไม่ใช่จำนวนเต็มในตัวอย่าง ${formatNumber(preview.invalidStarRows)} แถว`);
    }

    if (preview.missingCoordinateRows > 0) {
      warnings.push(`ไม่มีพิกัดในตัวอย่าง ${formatNumber(preview.missingCoordinateRows)} แถว จุดเหล่านี้จะไม่ปรากฏบนแผนที่`);
    }

    if (preview.invalidStateRows > 0) {
      warnings.push(`ไม่มีสถานะในตัวอย่าง ${formatNumber(preview.invalidStateRows)} แถว ควรตรวจสอบก่อนนำเข้า`);
    }

    if (preview.blankOrgResponseRows > 0) {
      warnings.push(`ไม่มีหน่วยงาน/ฝ่ายในตัวอย่าง ${formatNumber(preview.blankOrgResponseRows)} แถว`);
    }

    return [...warnings, ...preview.parseWarnings];
  }, [preview]);

  function onPickFile(file: File | null) {
    setSelectedFile(file);
    setRequestState("idle");
    setImportStage(file ? "preparing" : "idle");
    setImportProgress(file ? 8 : 0);
    setErrorMessage(null);
    setResult(null);
    setUploadTarget(null);
    setPreview(null);
  }

  async function requestUploadTarget(file: File) {
    const response = await fetch("/api/import/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "text/csv",
        size: file.size
      })
    });

    const payload = (await response.json()) as ImportUploadTarget & { error?: string };

    if (!response.ok) {
      throw new Error(payload.error || "เตรียมสิทธิ์อัปโหลดไฟล์ไม่สำเร็จ");
    }

    return payload;
  }

  async function uploadFileToStorage(file: File, target: ImportUploadTarget) {
    const supabase = createClient(target.supabaseUrl, target.anonKey);
    const uploadResult = await supabase.storage.from(target.bucket).uploadToSignedUrl(target.path, target.token, file, {
      contentType: file.type || "text/csv"
    });

    if (uploadResult.error) {
      throw new Error(`อัปโหลดไฟล์ไปพื้นที่เก็บไฟล์ไม่สำเร็จ: ${uploadResult.error.message}`);
    }
  }

  async function requestImportPreview(file: File, target: ImportUploadTarget) {
    const response = await fetch("/api/import/preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        path: target.path,
        filename: file.name,
        size: file.size
      })
    });
    const payload = (await response.json()) as ImportPreview & { error?: string };

    if (!response.ok) {
      throw new Error(payload.error || "ตรวจไฟล์นำเข้าไม่สำเร็จ");
    }

    return payload;
  }

  async function pollImportJob(importBatchId: string) {
    for (let attempt = 0; attempt < 900; attempt += 1) {
      await wait(2000);

      const response = await fetch(`/api/import/${importBatchId}`, {
        method: "GET",
        headers: {
          "Cache-Control": "no-store"
        }
      });
      const payload = (await response.json()) as ImportResult & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "โหลดสถานะรอบนำเข้าไม่สำเร็จ");
      }

      if (payload.status === "failed") {
        throw new Error(payload.errorMessage || "นำเข้าข้อมูลไม่สำเร็จ");
      }

      if (payload.status === "completed") {
        return payload;
      }

      setImportStage("processing");
      setImportProgress((currentProgress) => Math.min(Math.max(currentProgress, 62) + 1, 94));
    }

    throw new Error("นำเข้าข้อมูลใช้เวลานานเกินไป กรุณาตรวจสถานะล่าสุดที่หน้า Dashboard หรือทดลองใหม่ภายหลัง");
  }

  function stopProgressTimer() {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  function startProcessingProgress() {
    stopProgressTimer();
    progressTimerRef.current = window.setInterval(() => {
      setImportProgress((currentProgress) => {
        if (currentProgress < 42) {
          return currentProgress + 7;
        }

        if (currentProgress < 78) {
          return currentProgress + 3;
        }

        if (currentProgress < 92) {
          return currentProgress + 1;
        }

        return currentProgress;
      });
    }, 650);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0] || null;
    if (file) {
      onPickFile(file);
    }
  }

  async function submitImport() {
    if (!selectedFile) {
      return;
    }

    setRequestState("uploading");
    setImportStage("preparing");
    setImportProgress(12);
    setErrorMessage(null);
    setResult(null);

    try {
      let activeUploadTarget = uploadTarget;

      if (!preview || !activeUploadTarget) {
        activeUploadTarget = await requestUploadTarget(selectedFile);

        setImportStage("uploading");
        setImportProgress(28);
        await uploadFileToStorage(selectedFile, activeUploadTarget);
        setUploadTarget(activeUploadTarget);

        setImportStage("previewing");
        setImportProgress(52);
        const importPreview = await requestImportPreview(selectedFile, activeUploadTarget);
        setPreview(importPreview);
        setImportStage(importPreview.canImport ? "ready" : "error");
        setImportProgress(70);
        setRequestState("idle");
        return;
      }

      setImportStage("processing");
      setImportProgress(46);
      startProcessingProgress();

      const response = await fetch("/api/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          path: activeUploadTarget.path,
          filename: selectedFile.name
        })
      });

      setImportStage("finishing");
      setImportProgress(62);

      const payload = (await response.json()) as ImportResult & { error?: string };

      if (!response.ok) {
        setRequestState("error");
        setImportStage("error");
        setImportProgress(100);
        setErrorMessage(payload.error || "นำเข้าข้อมูลไม่สำเร็จ");
        return;
      }

      const completedPayload = payload.status === "completed" ? payload : await pollImportJob(payload.importBatchId);

      setRequestState("success");
      setImportStage("success");
      setImportProgress(100);
      setResult(completedPayload);
      setPreview(null);
      setUploadTarget(null);
      setRecentJobs((currentJobs) =>
        [
          completedPayload,
          ...currentJobs.filter((job) => job.importBatchId !== completedPayload.importBatchId)
        ].slice(0, 8)
      );
    } catch (error) {
      setRequestState("error");
      setImportStage("error");
      setImportProgress(100);
      setErrorMessage(error instanceof Error ? error.message : "นำเข้าข้อมูลไม่สำเร็จ");
    } finally {
      stopProgressTimer();
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold tracking-[-0.01em]">อัปโหลดไฟล์ข้อมูลจาก CityData</h2>
          <p className="text-sm leading-6 text-muted">
            ระบบจะตรวจ 15 คอลัมน์ตามรูปแบบปัจจุบัน อ่านข้อมูลหน่วยงาน คำนวณฝ่ายรับผิดชอบ และตรวจรายการเปลี่ยนแปลงกับข้อมูลเรื่องในระบบ
          </p>
        </div>

        <div className="mt-6">
          <label
            data-dragging={isDragging}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`motion-dropzone flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-[26px] border-2 border-dashed px-6 py-10 text-center transition ${
              isDragging
                ? "border-brand bg-[rgba(54,89,184,0.06)] shadow-hover"
                : "border-border bg-surface"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => onPickFile(event.target.files?.[0] || null)}
            />
            <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold tracking-[0.04em] text-brand">
              อัปโหลดไฟล์ CSV
            </span>
            <h3 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-ink">ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์</h3>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              รองรับไฟล์ CSV จาก CityData รูปแบบ 15 คอลัมน์ ระบบจะพักไฟล์ไว้ในพื้นที่เก็บไฟล์ชั่วคราวก่อนประมวลผลเพื่อลดปัญหาไฟล์ใหญ่
            </p>
            <p className="mt-6 text-sm font-semibold text-ink">
              {selectedFile ? `ไฟล์ที่เลือก: ${selectedFile.name}` : "ยังไม่ได้เลือกไฟล์"}
            </p>
          </label>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submitImport}
            className="rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-deep hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {formatSubmitLabel({ requestState, importStage, preview })}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-2xl border border-border bg-surface px-5 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-brand/35 hover:bg-white hover:text-brand hover:shadow-hover"
          >
            เลือกไฟล์ใหม่
          </button>
          <span className="text-sm text-muted">{formatStateLabel(requestState)}</span>
        </div>

        {requestState === "uploading" || requestState === "success" || requestState === "error" ? (
          <div className="mt-5 rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-ink" role="status" aria-live="polite">{formatStageLabel(importStage)}</p>
              <p className="font-mono text-sm font-semibold text-brand" aria-hidden="true">{importProgress}%</p>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-strong">
              <div
                role="progressbar"
                aria-label="ความคืบหน้าการนำเข้า"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={importProgress}
                className={`motion-progress h-full rounded-full transition-all duration-500 ${
                  requestState === "error" ? "bg-danger" : requestState === "success" ? "bg-success" : "bg-brand"
                }`}
                style={{ width: `${importProgress}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">
              เปอร์เซ็นต์นี้แสดงความคืบหน้าของขั้นตอนในระบบ ระหว่างประมวลผลไฟล์ใหญ่ระบบจะค่อย ๆ ขยับจนกว่างานฝั่งเซิร์ฟเวอร์จะเสร็จ
            </p>
          </div>
        ) : selectedFile ? (
          <div className="mt-5 rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-ink">{formatStageLabel(importStage)}</p>
              <p className="font-mono text-sm font-semibold text-muted">{importProgress}%</p>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-strong">
              <div
                role="progressbar"
                aria-label="ความคืบหน้าการตรวจไฟล์"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={importProgress}
                className="motion-progress h-full rounded-full bg-brand/45"
                style={{ width: `${importProgress}%` }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {preview ? (
        <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.01em]">ตรวจไฟล์เบื้องต้น</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                ระบบอ่านเฉพาะตัวอย่างแรกของไฟล์เพื่อลดเวลาและลดการใช้ทรัพยากร จากนั้นจะตรวจทั้งไฟล์อีกครั้งเมื่อกดยืนยันนำเข้า
              </p>
            </div>
            <span
              className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${
                preview.canImport ? "motion-status bg-success/10 text-success" : "bg-danger/10 text-danger"
              }`}
            >
              {preview.canImport ? "พร้อมนำเข้า" : "ต้องแก้ไฟล์"}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-sm text-muted">แถวที่ตรวจในตัวอย่าง</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{formatNumber(preview.sampledRows)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-sm text-muted">ประมาณแถวทั้งไฟล์</p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {preview.estimatedRows ? formatNumber(preview.estimatedRows) : "-"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-sm text-muted">ขนาดไฟล์</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{formatBytes(preview.fileSize)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-sm text-muted">อ่านเพื่อ preview</p>
              <p className="mt-1 text-2xl font-semibold text-ink">{formatBytes(preview.bytesRead)}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-success/25 bg-success/10 px-4 py-3">
              <p className="text-sm text-success">เรื่องใหม่ในตัวอย่าง</p>
              <p className="mt-1 text-2xl font-semibold text-success">{formatNumber(preview.sampledNewTicketRows)}</p>
            </div>
            <div className="rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3">
              <p className="text-sm text-brand">เรื่องเดิมในตัวอย่าง</p>
              <p className="mt-1 text-2xl font-semibold text-brand">{formatNumber(preview.sampledExistingTicketRows)}</p>
            </div>
            <div className="rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3">
              <p className="text-sm text-warning">คาดว่าเปลี่ยนในตัวอย่าง</p>
              <p className="mt-1 text-2xl font-semibold text-warning">{formatNumber(preview.sampledChangedTicketRows)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-2xl border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold text-ink">คอลัมน์ที่จับคู่ได้</h3>
              <div className="mt-3 grid gap-2 text-sm">
                {Object.entries(preview.mappedColumns).map(([requiredColumn, sourceColumn]) => (
                  <div key={requiredColumn} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                    <span className="font-mono text-xs text-muted">{requiredColumn}</span>
                    <span className="max-w-[220px] truncate font-semibold text-ink" title={sourceColumn}>
                      {sourceColumn}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className={`rounded-2xl border p-4 ${
                preview.missingRequiredColumns.length > 0
                  ? "border-danger/25 bg-danger/5"
                  : previewWarnings.length > 0
                    ? "border-warning/25 bg-warning/10"
                    : "border-success/25 bg-success/10"
              }`}
            >
              <h3
                className={`text-sm font-semibold ${
                  preview.missingRequiredColumns.length > 0
                    ? "text-danger"
                    : previewWarnings.length > 0
                      ? "text-warning"
                      : "text-success"
                }`}
              >
                {preview.missingRequiredColumns.length > 0
                  ? "พบปัญหาที่ต้องแก้ก่อนนำเข้า"
                  : previewWarnings.length > 0
                    ? "ข้อควรตรวจสอบก่อนยืนยัน"
                    : "ไม่พบปัญหาสำคัญในตัวอย่าง"}
              </h3>

              {preview.missingRequiredColumns.length > 0 ? (
                <p className="mt-3 text-sm leading-6 text-danger/90">
                  ไม่พบคอลัมน์จำเป็น: {formatColumnList(preview.missingRequiredColumns)}
                </p>
              ) : previewWarnings.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm leading-6 text-ink">
                  {previewWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-6 text-success">
                  กดยืนยันนำเข้าเพื่อเริ่มงานประมวลผลเบื้องหลัง ระบบจะตรวจข้อมูลเต็มไฟล์อีกครั้งก่อนบันทึก
                </p>
              )}

              <p className="mt-4 text-xs leading-5 text-muted">
                Preview อ่านสูงสุดประมาณ 512 KB และ 300 แถวแรกเท่านั้น เพื่อคุมการใช้ Vercel และ Supabase free tier
              </p>
            </div>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-ink">สัญญาณช่วยตรวจเพิ่มเติม</h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
                  เป็นข้อสังเกตจากกฎแบบระมัดระวังในตัวอย่างเท่านั้น ระบบไม่แก้ข้อมูล ไม่มอบหมายฝ่าย และไม่จัดลำดับงานแทนเจ้าหน้าที่
                </p>
              </div>
              <span className="w-fit rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand">ตรวจโดยคนก่อนใช้</span>
            </div>

            <div className="mt-4 grid overflow-hidden rounded-2xl border border-border bg-surface sm:grid-cols-3 sm:divide-x sm:divide-border">
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-muted">กลุ่มที่อาจเป็นเรื่องซ้ำ</p>
                <p className="mt-1 text-xl font-semibold text-ink">{formatNumber(preview.dataQualitySignals.semanticDuplicateGroupCount)}</p>
              </div>
              <div className="border-t border-border px-4 py-3 sm:border-t-0">
                <p className="text-xs font-semibold text-muted">เคสไม่มีฝ่ายที่มีหมวดแนะนำ</p>
                <p className="mt-1 text-xl font-semibold text-ink">{formatNumber(preview.dataQualitySignals.departmentSuggestionCount)}</p>
              </div>
              <div className="border-t border-border px-4 py-3 sm:border-t-0">
                <p className="text-xs font-semibold text-muted">ควรเร่งตรวจ / ควรติดตาม</p>
                <p className="mt-1 text-xl font-semibold text-ink">
                  {formatNumber(preview.dataQualitySignals.urgentAttentionCount)} / {formatNumber(preview.dataQualitySignals.reviewAttentionCount)}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {preview.dataQualitySignals.semanticDuplicateExamples.length > 0 ? (
                <details className="rounded-2xl border border-border bg-white px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">ดูตัวอย่างเรื่องที่อาจซ้ำกัน</summary>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
                    {preview.dataQualitySignals.semanticDuplicateExamples.map((example) => (
                      <li key={example.ticketIds.join(":")}>
                        <span className="font-mono text-xs font-semibold text-ink">{example.ticketIds.join(" ↔ ")}</span>
                        <span> · {example.reason}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {preview.dataQualitySignals.departmentSuggestionExamples.length > 0 ? (
                <details className="rounded-2xl border border-border bg-white px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">ดูตัวอย่างหมวดงานที่อาจเกี่ยวข้อง</summary>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
                    {preview.dataQualitySignals.departmentSuggestionExamples.map((example) => (
                      <li key={example.ticketId}>
                        <span className="font-mono text-xs font-semibold text-ink">{example.ticketId}</span>
                        <span> · {example.category} จากคำว่า “{example.matchedKeywords.join("”, “")}”</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {preview.dataQualitySignals.attentionExamples.length > 0 ? (
                <details className="rounded-2xl border border-border bg-white px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-ink">ดูตัวอย่างเคสที่ควรตรวจระดับความสนใจ</summary>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
                    {preview.dataQualitySignals.attentionExamples.map((example) => (
                      <li key={`${example.ticketId}:${example.level}`}>
                        <span className="font-mono text-xs font-semibold text-ink">{example.ticketId}</span>
                        <span> · {example.label} เพราะพบ “{example.matchedKeywords.join("”, “")}”</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {errorMessage ? (
        <section className="rounded-[28px] border border-danger/20 bg-danger/5 p-6" role="alert" aria-live="assertive">
          <h2 className="text-lg font-semibold text-danger">นำเข้าข้อมูลไม่สำเร็จ</h2>
          <p className="mt-2 text-sm leading-6 text-danger/90">{errorMessage}</p>
        </section>
      ) : null}

      {result ? (
        <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.01em]">สรุปรอบการนำเข้าล่าสุด</h2>
              <p className="mt-2 text-sm text-muted">
                รหัสรอบนำเข้า: <span className="font-mono text-xs">{result.importBatchId}</span>
              </p>
            </div>
            <p className="rounded-full bg-brand/10 px-4 py-2 text-sm font-semibold text-brand">{result.filename}</p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl bg-surface p-4">
              <p className="text-sm text-muted">แถวทั้งหมด</p>
              <p className="mt-2 text-3xl font-semibold">{result.totalRows}</p>
            </div>
            <div className="rounded-2xl bg-[rgba(31,122,90,0.10)] p-4">
              <p className="text-sm text-success">เรื่องใหม่</p>
              <p className="mt-2 text-3xl font-semibold text-success">{result.newTickets}</p>
            </div>
            <div className="rounded-2xl bg-[rgba(201,131,34,0.12)] p-4">
              <p className="text-sm text-warning">เรื่องที่เปลี่ยน</p>
              <p className="mt-2 text-3xl font-semibold text-warning">{result.changedTickets}</p>
            </div>
            <div className="rounded-2xl border border-warning/25 bg-[rgba(201,131,34,0.12)] p-4">
              <p className="text-sm text-warning">เปิดกลับ</p>
              <p className="mt-2 text-3xl font-semibold text-warning">{result.reopenedTickets}</p>
            </div>
            <div className="rounded-2xl bg-surface-strong p-4">
              <p className="text-sm text-muted">ไม่เปลี่ยน</p>
              <p className="mt-2 text-3xl font-semibold text-ink">{result.unchangedTickets}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-muted">เรื่องที่ประมวลผลจริง</p>
              <p className="mt-1 font-semibold text-ink">{result.processedRows}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-muted">แถว ticket ซ้ำที่ข้าม</p>
              <p className="mt-1 font-semibold text-ink">{result.duplicateRows}</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface px-4 py-3">
              <p className="text-muted">ช่องข้อมูลที่เปลี่ยนในเรื่องเดิม</p>
              <p className="mt-1 font-semibold text-ink">{result.changedFields}</p>
            </div>
          </div>
          <div className="mt-6">
            <Link
              href={`/dashboard?import=${result.importBatchId}`}
              className="inline-flex rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-deep hover:shadow-hover"
            >
              เปิดหน้าสรุปล่าสุด
            </Link>
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.01em]">ประวัติรอบนำเข้า</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              ตรวจสถานะงานล่าสุด รายละเอียดข้อผิดพลาด และจำนวนแถวที่ประมวลผลได้จากหน้านี้
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-2xl border border-border bg-surface px-5 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-brand/35 hover:bg-white hover:text-brand hover:shadow-hover"
          >
            รีเฟรชสถานะ
          </button>
        </div>

        {recentJobs.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-border bg-surface px-4 py-5 text-sm leading-6 text-muted">
            ยังไม่มีประวัติการนำเข้า เมื่อเริ่มนำเข้าไฟล์ ระบบจะแสดงสถานะและผลลัพธ์ล่าสุดที่นี่
          </div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-border">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="ตารางประวัติรอบนำเข้า เลื่อนในแนวนอนได้">
              <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                <caption className="sr-only">ประวัติรอบนำเข้า 8 รอบล่าสุด</caption>
                <thead className="bg-surface text-xs font-semibold text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3">เวลา</th>
                    <th scope="col" className="px-4 py-3">ไฟล์</th>
                    <th scope="col" className="px-4 py-3">สถานะ</th>
                    <th scope="col" className="px-4 py-3 text-right">แถว</th>
                    <th scope="col" className="px-4 py-3 text-right">ใหม่</th>
                    <th scope="col" className="px-4 py-3 text-right">เปลี่ยน</th>
                    <th scope="col" className="px-4 py-3">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {recentJobs.map((job) => (
                    <tr key={job.importBatchId} className="motion-row">
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(job.importedAt)}</td>
                      <td className="max-w-[260px] truncate px-4 py-3 font-semibold text-ink" title={job.filename}>
                        {job.filename}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getJobStatusClass(job)}`}>
                          {formatJobStatus(job)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">{formatNumber(job.totalRows)}</td>
                      <td className="px-4 py-3 text-right text-success">{formatNumber(job.newTickets)}</td>
                      <td className="px-4 py-3 text-right text-warning">{formatNumber(job.changedTickets)}</td>
                      <td className="max-w-[320px] px-4 py-3 text-muted">
                        {job.errorMessage ? (
                          <span className="text-danger">{job.errorMessage}</span>
                        ) : job.status === "completed" || !job.status ? (
                          `ประมวลผล ${formatNumber(job.processedRows)} เรื่อง, ข้ามซ้ำ ${formatNumber(job.duplicateRows)} แถว`
                        ) : (
                          "กำลังรอสถานะล่าสุด"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
