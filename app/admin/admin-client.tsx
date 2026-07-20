"use client";

import { useState } from "react";

type BackupResult = {
  filename: string;
  storageObjects: number;
  sizeBytes: number;
  tableRows: number;
};

type WipeMode = "reports" | "all";

type OperationsSnapshot = {
  outbox: {
    pending: number;
    processing: number;
    failed: number;
    dead: number;
    staleLeases: number;
    oldestActionableAt: string | null;
    oldestDeadAt: string | null;
    maxAttempts: number;
  };
  imports: {
    active: number;
    failed: number;
    staleActive: number;
    staleQueued: number;
    staleRunning: number;
    oldestActiveAt: string | null;
    oldestHeartbeatAt: string | null;
  };
};

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

export function AdminOperationsPanel({ operations }: { operations: OperationsSnapshot }) {
  const [pendingAction, setPendingAction] = useState<"maintenance" | "retry" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const retryable = operations.outbox.failed + operations.outbox.dead;

  async function runAction(action: "run-maintenance" | "retry-storage-queue") {
    setPendingAction(action === "run-maintenance" ? "maintenance" : "retry");
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirmation })
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        status?: string;
        retried?: number;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "ดำเนินการคิวงานไม่สำเร็จ");
      }

      setMessage(
        action === "retry-storage-queue"
          ? `นำงานกลับเข้าคิวแล้ว ${payload?.retried || 0} รายการ`
          : "รัน maintenance ครบทุกขั้นตอนแล้ว"
      );
      setConfirmation("");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ดำเนินการคิวงานไม่สำเร็จ");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-panel" aria-labelledby="operations-title">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 id="operations-title" className="text-xl font-bold text-ink">Operations queue</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            ตรวจงานลบไฟล์ที่รอทำ งานที่หยุดหลัง retry ครบ และ import ที่ heartbeat ขาด ก่อนสั่ง maintenance ด้วยตนเอง
          </p>
        </div>
        <button
          type="button"
          onClick={() => runAction("run-maintenance")}
          disabled={pendingAction !== null}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pendingAction === "maintenance" ? "กำลังรัน maintenance..." : "รัน maintenance ตอนนี้"}
        </button>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-surface px-4 py-3">
          <dt className="text-xs font-semibold text-muted">Storage รอดำเนินการ</dt>
          <dd className="mt-1 text-2xl font-semibold text-ink">{operations.outbox.pending}</dd>
        </div>
        <div className="rounded-2xl bg-surface px-4 py-3">
          <dt className="text-xs font-semibold text-muted">กำลังประมวลผล</dt>
          <dd className="mt-1 text-2xl font-semibold text-ink">{operations.outbox.processing}</dd>
        </div>
        <div className="rounded-2xl bg-danger/5 px-4 py-3">
          <dt className="text-xs font-semibold text-danger">Failed / dead-letter</dt>
          <dd className="mt-1 text-2xl font-semibold text-danger">{retryable}</dd>
        </div>
        <div className="rounded-2xl bg-warning/10 px-4 py-3">
          <dt className="text-xs font-semibold text-warning">Import ขาด heartbeat</dt>
          <dd className="mt-1 text-2xl font-semibold text-warning">{operations.imports.staleActive}</dd>
        </div>
      </dl>

      {retryable > 0 ? (
        <div className="mt-5 rounded-2xl border border-danger/20 bg-danger/5 p-4">
          <label htmlFor="queue-retry-confirmation" className="text-sm font-semibold text-danger">
            ยืนยันการนำ failed/dead-letter กลับเข้าคิว
          </label>
          <p id="queue-retry-help" className="mt-1 text-sm leading-6 text-danger/90">
            ตรวจสาเหตุใน audit/log ก่อน แล้วพิมพ์ <code className="rounded bg-white px-1.5 py-0.5 font-mono">RETRY STORAGE QUEUE</code>
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="queue-retry-confirmation"
              aria-describedby="queue-retry-help"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="min-h-11 flex-1 rounded-2xl border border-danger/25 bg-white px-4 text-sm text-ink outline-none focus:border-danger focus:ring-4 focus:ring-danger/10"
            />
            <button
              type="button"
              onClick={() => runAction("retry-storage-queue")}
              disabled={pendingAction !== null || confirmation !== "RETRY STORAGE QUEUE"}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-danger px-5 py-3 text-sm font-semibold text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pendingAction === "retry" ? "กำลังนำกลับเข้าคิว..." : `Retry ${retryable} รายการ`}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-2xl bg-success/10 px-4 py-3 text-sm font-semibold text-success">
          ไม่มี failed หรือ dead-letter ที่ต้องดำเนินการ
        </p>
      )}

      {message ? <p role="status" className="mt-4 text-sm font-semibold text-success">{message}</p> : null}
      {errorMessage ? <p role="alert" className="mt-4 text-sm font-semibold text-danger">{errorMessage}</p> : null}
    </section>
  );
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
    <section className="rounded-2xl bg-white p-6 shadow-panel">
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
          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isExporting ? "กำลังสร้าง backup..." : "สร้าง Backup ZIP"}
        </button>
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger"
        >
          {errorMessage}
        </p>
      ) : null}

      {backupResult ? (
        <div role="status" className="mt-5 rounded-2xl border border-success/20 bg-success/10 p-4">
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
    <section className="rounded-2xl border border-danger/20 bg-danger/5 p-6">
      <h2 className="text-xl font-bold text-danger">Wipe data</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-danger/90">
        ใช้หลังจาก backup สำเร็จแล้วเท่านั้น โหมดล้างรายงานจะลบ report batches, รายการฝ่าย, รายการเคสในรายงาน และไฟล์หลักฐาน
        ส่วนโหมดล้างทั้งหมดจะล้าง ticket/import/report data และไฟล์ชั่วคราว โดยไม่ลบ backup ZIP ใน export bucket
      </p>
      <p id="wipe-warning" className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-danger">
        การล้างข้อมูลไม่สามารถย้อนกลับได้ โปรดตรวจสอบไฟล์ Backup ZIP ก่อนดำเนินการ
      </p>
      <p className="mt-3 max-w-3xl rounded-2xl border border-danger/20 bg-white px-4 py-3 text-sm leading-6 text-danger">
        Environment: <span className="font-semibold">{environmentName}</span>
        {isProduction ? " · ต้องพิมพ์คำว่า PRODUCTION ต่อท้ายคำยืนยันก่อนล้างข้อมูลจริง" : " · ใช้สำหรับทดสอบ flow ก่อนขึ้น production"}
      </p>

      <fieldset aria-describedby="wipe-warning wipe-confirmation-help" className="mt-5">
        <legend className="text-sm font-semibold text-danger">เลือกขอบเขตและยืนยันการล้างข้อมูล</legend>
        <p id="wipe-confirmation-help" className="mt-2 text-sm leading-6 text-danger/90">
          หากต้องการดำเนินการ ให้พิมพ์ <code className="rounded bg-white px-1.5 py-0.5 font-mono">{requiredConfirmation}</code> ให้ตรงทุกตัวอักษร
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-[240px_1fr_auto]">
          <div>
            <label htmlFor="wipe-mode" className="sr-only">
              ขอบเขตข้อมูลที่ต้องการล้าง
            </label>
            <select
              id="wipe-mode"
              value={mode}
              onChange={(event) => {
                setMode(event.target.value === "all" ? "all" : "reports");
                setConfirmation("");
              }}
              className="min-h-12 w-full rounded-2xl border border-danger/25 bg-white px-4 text-sm font-semibold text-ink outline-none focus:border-danger focus:ring-4 focus:ring-danger/10"
            >
              <option value="reports">ล้างเฉพาะข้อมูลรายงาน</option>
              <option value="all">ล้างข้อมูลระบบทั้งหมด</option>
            </select>
          </div>
          <div>
            <label htmlFor="wipe-confirmation" className="sr-only">
              คำยืนยันการล้างข้อมูล
            </label>
            <input
              id="wipe-confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={`พิมพ์ ${requiredConfirmation}`}
              autoComplete="off"
              spellCheck={false}
              className="min-h-12 w-full rounded-2xl border border-danger/25 bg-white px-4 text-sm text-ink outline-none focus:border-danger focus:ring-4 focus:ring-danger/10"
            />
          </div>
          <button
            type="button"
            onClick={wipeData}
            disabled={isWiping || confirmation !== requiredConfirmation}
            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-danger px-5 py-3 text-sm font-semibold text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isWiping ? "กำลังล้าง..." : "ล้างข้อมูลถาวร"}
          </button>
        </div>
      </fieldset>

      {resultMessage ? (
        <p role="status" className="mt-4 rounded-2xl border border-success/20 bg-white px-4 py-3 text-sm leading-6 text-success">
          {resultMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p role="alert" className="mt-4 rounded-2xl border border-danger/20 bg-white px-4 py-3 text-sm leading-6 text-danger">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
