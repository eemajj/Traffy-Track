"use client";

import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { requestImportPreview, requestImportUploadTarget, uploadImportFile } from "@/app/import/import-client-api";
import { getImportJobStage, type ImportPreview, type ImportResult, type ImportStage, type ImportUploadTarget, type RequestState } from "@/lib/import/client-model";

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useImportController(initialJobs: ImportResult[]) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const consumerRequestRef = useRef<Promise<Response | null> | null>(null);
  const resumedJobRef = useRef<string | null>(null);
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
  const [isDownloadingCorrections, setIsDownloadingCorrections] = useState(false);
  const [activeJob, setActiveJob] = useState<ImportResult | null>(null);

  const canSubmit = useMemo(
    () => selectedFile !== null && requestState !== "uploading" && (!preview || preview.canImport),
    [preview, requestState, selectedFile]
  );

  function onPickFile(file: File | null) {
    if (requestState === "uploading") return;
    setSelectedFile(file);
    setRequestState("idle");
    setImportStage(file ? "preparing" : "idle");
    setImportProgress(file ? 8 : 0);
    setErrorMessage(null);
    setResult(null);
    setUploadTarget(null);
    setPreview(null);
    setActiveJob(null);
  }

  async function downloadCorrectionArtifact() {
    if (!selectedFile || !uploadTarget) return;
    setIsDownloadingCorrections(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/import/correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: uploadTarget.path, filename: selectedFile.name })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "ดาวน์โหลดรายการแก้ไขไม่สำเร็จ");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${selectedFile.name.replace(/\.csv$/i, "")}-corrections.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ดาวน์โหลดรายการแก้ไขไม่สำเร็จ");
    } finally {
      setIsDownloadingCorrections(false);
    }
  }

  const pollImportJob = useCallback(async (importBatchId: string) => {
    let consecutiveStatusFailures = 0;
    for (let attempt = 0; attempt < 900; attempt += 1) {
      if (attempt % 15 === 0 && !consumerRequestRef.current) {
        consumerRequestRef.current = fetch("/api/import/consume", { method: "POST" })
          .catch(() => null)
          .finally(() => {
            consumerRequestRef.current = null;
          });
      }
      await wait(2000);
      let response: Response;
      try {
        response = await fetch(`/api/import/${importBatchId}`, { method: "GET", headers: { "Cache-Control": "no-store" } });
      } catch {
        consecutiveStatusFailures += 1;
        if (consecutiveStatusFailures < 5) continue;
        throw new Error("ขาดการเชื่อมต่อระหว่างติดตามสถานะ งานยังทำต่อบนเซิร์ฟเวอร์ กรุณารีเฟรชหน้านี้เพื่อติดตามอีกครั้ง");
      }
      const payload = (await response.json().catch(() => null)) as (ImportResult & { error?: string }) | null;
      if (!response.ok || !payload) {
        consecutiveStatusFailures += 1;
        if (consecutiveStatusFailures < 5) continue;
        throw new Error(payload?.error || "ติดตามสถานะไม่ได้ชั่วคราว แต่งานยังทำต่อบนเซิร์ฟเวอร์");
      }
      consecutiveStatusFailures = 0;
      setActiveJob(payload);
      setRecentJobs((jobs) => [payload, ...jobs.filter((job) => job.importBatchId !== payload.importBatchId)].slice(0, 8));
      setImportStage(getImportJobStage(payload));
      if (payload.status === "failed") {
        const attempt = payload.maxAttempts ? ` (ครบ ${payload.attemptCount || 0}/${payload.maxAttempts} ครั้ง)` : "";
        throw new Error(`${payload.errorMessage || "นำเข้าข้อมูลไม่สำเร็จ"}${attempt}`);
      }
      if (payload.status === "completed") return payload;
    }
    throw new Error("หยุดติดตามสถานะอัตโนมัติหลัง 30 นาที แต่งานยังทำต่อบนเซิร์ฟเวอร์ กรุณารีเฟรชหน้านี้เพื่อติดตามอีกครั้ง");
  }, []);

  useEffect(() => {
    const activeInitialJob = initialJobs.find((job) => job.status === "queued" || job.status === "running");
    if (!activeInitialJob || resumedJobRef.current === activeInitialJob.importBatchId) return;
    resumedJobRef.current = activeInitialJob.importBatchId;
    setActiveJob(activeInitialJob);
    setRequestState("uploading");
    setImportStage(getImportJobStage(activeInitialJob));
    void pollImportJob(activeInitialJob.importBatchId)
      .then((completed) => {
        setRequestState("success");
        setImportStage("success");
        setImportProgress(100);
        setResult(completed);
        setActiveJob(completed);
        setRecentJobs((jobs) => [completed, ...jobs.filter((job) => job.importBatchId !== completed.importBatchId)].slice(0, 8));
      })
      .catch((error) => {
        setRequestState("error");
        setImportStage("error");
        setImportProgress(100);
        setErrorMessage(error instanceof Error ? error.message : "ติดตามสถานะรอบนำเข้าไม่สำเร็จ");
      });
  }, [initialJobs, pollImportJob]);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (requestState === "uploading") return;
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0] || null;
    if (file) onPickFile(file);
  }

  async function submitImport() {
    if (!selectedFile) return;
    setRequestState("uploading");
    setImportStage("preparing");
    setImportProgress(12);
    setErrorMessage(null);
    setResult(null);

    try {
      let activeUploadTarget = uploadTarget;
      if (!preview || !activeUploadTarget) {
        activeUploadTarget = await requestImportUploadTarget(selectedFile);
        setImportStage("uploading");
        setImportProgress(28);
        await uploadImportFile(selectedFile, activeUploadTarget);
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
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: activeUploadTarget.path, filename: selectedFile.name })
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

      setActiveJob(payload);
      setRecentJobs((jobs) => [payload, ...jobs.filter((job) => job.importBatchId !== payload.importBatchId)].slice(0, 8));
      setImportStage(getImportJobStage(payload));

      const completed = payload.status === "completed" ? payload : await pollImportJob(payload.importBatchId);
      setRequestState("success");
      setImportStage("success");
      setImportProgress(100);
      setResult(completed);
      setPreview(null);
      setUploadTarget(null);
      setActiveJob(completed);
      setRecentJobs((jobs) => [completed, ...jobs.filter((job) => job.importBatchId !== completed.importBatchId)].slice(0, 8));
    } catch (error) {
      setRequestState("error");
      setImportStage("error");
      setImportProgress(100);
      setErrorMessage(error instanceof Error ? error.message : "นำเข้าข้อมูลไม่สำเร็จ");
    }
  }

  return {
    canSubmit,
    activeJob,
    downloadCorrectionArtifact,
    errorMessage,
    fileInputRef,
    importProgress,
    importStage,
    isDownloadingCorrections,
    isDragging,
    onDrop,
    onPickFile,
    preview,
    recentJobs,
    requestState,
    result,
    selectedFile,
    setIsDragging,
    submitImport,
    uploadTarget
  };
}
