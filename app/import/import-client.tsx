"use client";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { DragEvent, useMemo, useRef, useState } from "react";

type ImportResult = {
  filename: string;
  totalRows: number;
  newTickets: number;
  changedTickets: number;
  unchangedTickets: number;
  importBatchId: string;
};

type RequestState = "idle" | "uploading" | "success" | "error";
type ImportStage = "idle" | "preparing" | "uploading" | "processing" | "finishing" | "success" | "error";

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
    processing: "กำลังอ่านไฟล์ CSV ตรวจรายการเปลี่ยนแปลง และบันทึกลงฐานข้อมูล",
    finishing: "กำลังสรุปผลการนำเข้า",
    success: "นำเข้าข้อมูลสำเร็จ",
    error: "หยุดเพราะพบข้อผิดพลาด"
  };

  return labels[stage];
}

export function ImportClient() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [importStage, setImportStage] = useState<ImportStage>("idle");
  const [importProgress, setImportProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const canSubmit = useMemo(
    () => selectedFile !== null && requestState !== "uploading",
    [requestState, selectedFile]
  );

  function onPickFile(file: File | null) {
    setSelectedFile(file);
    setRequestState("idle");
    setImportStage(file ? "preparing" : "idle");
    setImportProgress(file ? 8 : 0);
    setErrorMessage(null);
    setResult(null);
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
      const uploadTarget = await requestUploadTarget(selectedFile);

      setImportStage("uploading");
      setImportProgress(28);
      await uploadFileToStorage(selectedFile, uploadTarget);

      setImportStage("processing");
      setImportProgress(46);
      startProcessingProgress();

      const response = await fetch("/api/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          path: uploadTarget.path,
          filename: selectedFile.name
        })
      });

      setImportStage("finishing");
      setImportProgress(96);

      const payload = (await response.json()) as ImportResult & { error?: string };

      if (!response.ok) {
        setRequestState("error");
        setImportStage("error");
        setImportProgress(100);
        setErrorMessage(payload.error || "นำเข้าข้อมูลไม่สำเร็จ");
        return;
      }

      setRequestState("success");
      setImportStage("success");
      setImportProgress(100);
      setResult(payload);
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
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-[26px] border-2 border-dashed px-6 py-10 text-center transition ${
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
              เริ่มนำเข้า
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
          <div
            className="mt-5 rounded-2xl border border-border bg-surface p-4"
            role="status"
            aria-live="polite"
            aria-label={`ความคืบหน้าการนำเข้า ${importProgress}%`}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-ink">{formatStageLabel(importStage)}</p>
              <p className="font-mono text-sm font-semibold text-brand">{importProgress}%</p>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-strong">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
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
              <div className="h-full rounded-full bg-brand/45" style={{ width: `${importProgress}%` }} />
            </div>
          </div>
        ) : null}
      </section>

      {errorMessage ? (
        <section className="rounded-[28px] border border-danger/20 bg-danger/5 p-6">
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

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="rounded-2xl bg-surface-strong p-4">
              <p className="text-sm text-muted">ไม่เปลี่ยน</p>
              <p className="mt-2 text-3xl font-semibold text-ink">{result.unchangedTickets}</p>
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
    </div>
  );
}
