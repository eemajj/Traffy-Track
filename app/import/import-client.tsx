"use client";

import { ImportProgress } from "@/app/import/import-progress";
import { ImportResultSummary } from "@/app/import/import-result-summary";
import { ImportJobHistory } from "@/app/import/import-job-history";
import { ImportPreviewPanel } from "@/app/import/import-preview";
import { useImportController } from "@/app/import/use-import-controller";
import {
  formatImportStateLabel as formatStateLabel,
  formatImportSubmitLabel as formatSubmitLabel,
  type ImportResult,
} from "@/lib/import/client-model";

export function ImportClient({ initialJobs }: { initialJobs: ImportResult[] }) {
  const {
    activeJob, canSubmit, downloadCorrectionArtifact, errorMessage, fileInputRef, importProgress, importStage,
    isDownloadingCorrections, isDragging, onDrop, onPickFile, preview, recentJobs, requestState,
    result, selectedFile, setIsDragging, submitImport, uploadTarget
  } = useImportController(initialJobs);
  const isBusy = requestState === "uploading";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold tracking-[-0.01em]">อัปโหลดไฟล์ข้อมูลจาก CityData</h2>
          <p className="text-sm leading-6 text-muted">
            ระบบจะตรวจ 15 คอลัมน์ตามรูปแบบปัจจุบัน อ่านค่าฝ่ายตามไฟล์ CityData โดยไม่แก้ไขหรือมอบหมายใหม่ และตรวจรายการเปลี่ยนแปลงกับข้อมูลเรื่องในระบบ
          </p>
        </div>

        <div className="mt-6">
          <label
            data-dragging={isDragging}
            onDragOver={(event) => {
              event.preventDefault();
              if (!isBusy) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            aria-disabled={isBusy}
            className={`motion-dropzone flex min-h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
              isBusy ? "cursor-not-allowed opacity-70" : "cursor-pointer"
            } ${
              isDragging
                ? "border-brand bg-brand/5 shadow-hover"
                : "border-border bg-surface"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              disabled={isBusy}
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
            disabled={isBusy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-2xl border border-border bg-surface px-5 py-3 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:border-brand/35 hover:bg-white hover:text-brand hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none"
          >
            เลือกไฟล์ใหม่
          </button>
          <span className="text-sm text-muted">{formatStateLabel(requestState, importStage)}</span>
        </div>

        <ImportProgress activeJob={activeJob} hasFile={Boolean(selectedFile)} requestState={requestState} stage={importStage} progress={importProgress} />
      </section>

      {preview ? (
        <ImportPreviewPanel
          preview={preview}
          canDownloadCorrections={Boolean(uploadTarget)}
          isDownloadingCorrections={isDownloadingCorrections}
          onDownloadCorrections={downloadCorrectionArtifact}
        />
      ) : null}


      {errorMessage ? (
        <section className="rounded-2xl border border-danger/20 bg-danger/5 p-6" role="alert" aria-live="assertive">
          <h2 className="text-lg font-semibold text-danger">
            {activeJob?.status === "queued" || activeJob?.status === "running" ? "หยุดติดตามสถานะชั่วคราว" : "นำเข้าข้อมูลไม่สำเร็จ"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-danger/90">{errorMessage}</p>
        </section>
      ) : null}

      <ImportResultSummary result={result} />

      <ImportJobHistory jobs={recentJobs} />
    </div>
  );
}
