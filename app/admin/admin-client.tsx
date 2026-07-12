"use client";

import { useState } from "react";

type BackupResult = {
  filename: string;
  storageObjects: number;
  sizeBytes: number;
  tableRows: number;
};

type WipeMode = "reports" | "all";

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function parseContentDispositionFilename(value: string | null) {
  const match = value?.match(/filename="([^"]+)"/);
  return match?.[1] || null;
}

export function AdminBackupPanel() {
  const [isExporting, setIsExporting] = useState(false);
  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function createBackup() {
    setIsExporting(true);
    setErrorMessage(null);
    setBackupResult(null);

    try {
      const response = await fetch("/api/admin/backup/export", {
        method: "POST"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "สร้าง backup ไม่สำเร็จ");
      }

      const blob = await response.blob();
      const filename = parseContentDispositionFilename(response.headers.get("content-disposition")) || "system-backup.zip";
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setBackupResult({
        filename,
        storageObjects: Number(response.headers.get("x-backup-storage-objects") || 0),
        tableRows: Number(response.headers.get("x-backup-table-rows") || 0),
        sizeBytes: blob.size
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "สร้าง backup ไม่สำเร็จ");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Backup export</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            สร้างไฟล์ ZIP รวมข้อมูลตารางหลักเป็น JSON/CSV และไฟล์หลักฐานจาก Storage แล้วดาวน์โหลดลงเครื่องผู้ใช้โดยตรง
          </p>
        </div>
        <button
          type="button"
          onClick={createBackup}
          disabled={isExporting}
          className="rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isExporting ? "กำลังสร้าง backup..." : "สร้าง Backup ZIP"}
        </button>
      </div>

      {errorMessage ? (
        <p className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger">
          {errorMessage}
        </p>
      ) : null}

      {backupResult ? (
        <div className="mt-5 rounded-2xl border border-success/20 bg-success/10 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-success">ดาวน์โหลด backup สำเร็จ</p>
              <p className="mt-1 font-mono text-xs leading-5 text-ink">{backupResult.filename}</p>
              <p className="mt-2 text-sm text-muted">
                ขนาด ZIP {formatBytes(backupResult.sizeBytes)} · ไฟล์หลักฐาน {backupResult.storageObjects} รายการ · rows จากตาราง{" "}
                {backupResult.tableRows} รายการ
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function AdminWipePanel({
  isProduction,
  environmentName
}: {
  isProduction: boolean;
  environmentName: string;
}) {
  const [mode, setMode] = useState<WipeMode>("reports");
  const [confirmation, setConfirmation] = useState("");
  const [isWiping, setIsWiping] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requiredConfirmation = `${mode === "all" ? "WIPE ALL DATA" : "WIPE REPORT DATA"}${
    isProduction ? " PRODUCTION" : ""
  }`;

  async function wipeData() {
    setIsWiping(true);
    setResultMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/wipe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode,
          confirmation
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; completedAt?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "ล้างข้อมูลไม่สำเร็จ");
      }

      setResultMessage(`ล้างข้อมูลสำเร็จเมื่อ ${payload?.completedAt || new Date().toISOString()}`);
      setConfirmation("");
      window.setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ล้างข้อมูลไม่สำเร็จ");
    } finally {
      setIsWiping(false);
    }
  }

  return (
    <section className="rounded-3xl border border-danger/20 bg-danger/5 p-6">
      <h2 className="text-xl font-bold text-danger">Wipe data</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-danger/90">
        ใช้หลังจาก backup สำเร็จแล้วเท่านั้น โหมดล้างรายงานจะลบ report batches, รายการฝ่าย, รายการเคสในรายงาน และไฟล์หลักฐาน
        ส่วนโหมดล้างทั้งหมดจะล้าง ticket/import/report data และไฟล์ชั่วคราว โดยไม่ลบ backup ZIP ใน export bucket
      </p>
      <p className="mt-3 max-w-3xl rounded-2xl border border-danger/20 bg-white px-4 py-3 text-sm leading-6 text-danger">
        Environment: <span className="font-semibold">{environmentName}</span>
        {isProduction ? " · ต้องพิมพ์คำว่า PRODUCTION ต่อท้ายคำยืนยันก่อนล้างข้อมูลจริง" : " · ใช้สำหรับทดสอบ flow ก่อนขึ้น production"}
      </p>

      <div className="mt-5 grid gap-3 lg:grid-cols-[240px_1fr_auto]">
        <select
          value={mode}
          onChange={(event) => {
            setMode(event.target.value === "all" ? "all" : "reports");
            setConfirmation("");
          }}
          className="min-h-12 rounded-2xl border border-danger/25 bg-white px-4 text-sm font-semibold text-ink outline-none focus:border-danger focus:ring-4 focus:ring-danger/10"
        >
          <option value="reports">ล้างเฉพาะข้อมูลรายงาน</option>
          <option value="all">ล้างข้อมูลระบบทั้งหมด</option>
        </select>
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={`พิมพ์ ${requiredConfirmation}`}
          className="min-h-12 rounded-2xl border border-danger/25 bg-white px-4 text-sm text-ink outline-none focus:border-danger focus:ring-4 focus:ring-danger/10"
        />
        <button
          type="button"
          onClick={wipeData}
          disabled={isWiping || confirmation !== requiredConfirmation}
          className="rounded-2xl bg-danger px-5 py-3 text-sm font-semibold text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isWiping ? "กำลังล้าง..." : "ล้างข้อมูล"}
        </button>
      </div>

      {resultMessage ? (
        <p className="mt-4 rounded-2xl border border-success/20 bg-white px-4 py-3 text-sm leading-6 text-success">
          {resultMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 rounded-2xl border border-danger/20 bg-white px-4 py-3 text-sm leading-6 text-danger">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
