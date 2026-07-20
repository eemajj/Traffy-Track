import { formatImportAttempt, formatImportDateTime, formatImportStageLabel, type ImportResult, type ImportStage, type RequestState } from "@/lib/import/client-model";

export function ImportProgress({
  activeJob,
  hasFile,
  requestState,
  stage,
  progress
}: {
  activeJob: ImportResult | null;
  hasFile: boolean;
  requestState: RequestState;
  stage: ImportStage;
  progress: number;
}) {
  const isActive = requestState === "uploading" || requestState === "success" || requestState === "error";
  if (!isActive && !hasFile) return null;
  const isServerProcessing = requestState === "uploading" && ["queued", "retrying", "processing", "finishing"].includes(stage);
  const barClass = isActive
    ? requestState === "error" ? "bg-danger" : requestState === "success" ? "bg-success" : "bg-brand"
    : "bg-brand/45";

  return (
    <div className="mt-5 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-ink" role="status" aria-live="polite">{formatImportStageLabel(stage)}</p>
        <p className={`font-mono text-sm font-semibold ${isActive ? "text-brand" : "text-muted"}`} aria-hidden="true">
          {isServerProcessing ? "กำลังทำงาน" : `${progress}%`}
        </p>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-strong">
        <div
          role="progressbar"
          aria-label={isActive ? "ความคืบหน้าการนำเข้า" : "ความคืบหน้าการตรวจไฟล์"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={isServerProcessing ? undefined : progress}
          aria-valuetext={isServerProcessing ? formatImportStageLabel(stage) : undefined}
          className={`${isServerProcessing ? "motion-progress-indeterminate" : "motion-progress"} h-full rounded-full transition-all duration-500 ${barClass}`}
          style={{ width: isServerProcessing ? "42%" : `${progress}%` }}
        />
      </div>
      {isServerProcessing ? <div className="mt-3 space-y-1 text-xs leading-5 text-muted" aria-live="polite" aria-atomic="true">
        <p>ระบบแสดงสถานะจากงานจริงโดยตรง จึงไม่ใช้เปอร์เซ็นต์คาดการณ์ระหว่างประมวลผลไฟล์ใหญ่</p>
        {activeJob && formatImportAttempt(activeJob) ? <p className="font-semibold text-ink">{formatImportAttempt(activeJob)}</p> : null}
        {stage === "retrying" && activeJob?.nextAttemptAt ? <p>กำหนดลองใหม่: {formatImportDateTime(activeJob.nextAttemptAt)}</p> : null}
        {activeJob?.errorMessage ? <p className="text-warning">ข้อผิดพลาดจากครั้งก่อน: {activeJob.errorMessage}</p> : null}
      </div> : null}
    </div>
  );
}
