"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ImportResult } from "@/lib/import/client-model";

type ImportCompletionToastProps = {
  result: ImportResult | null;
  errorMessage?: string | null;
  onDismiss?: () => void;
};

export function ImportCompletionToast({ result, errorMessage, onDismiss }: ImportCompletionToastProps) {
  const activeKey = result ? result.importBatchId : errorMessage || null;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const visible = Boolean(activeKey && activeKey !== dismissedKey);

  useEffect(() => {
    if (!activeKey || activeKey === dismissedKey) return;

    // Trigger Web Notification API if permitted and supported
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      if (result && result.status === "completed") {
        new Notification("นำเข้าข้อมูล CityData สำเร็จ", {
          body: `ประมวลผล ${result.processedRows} เรื่อง (ใหม่ ${result.newTickets}, เปลี่ยนแปลง ${result.changedTickets})`,
          icon: "/favicon.ico"
        });
      } else if (errorMessage) {
        new Notification("นำเข้าข้อมูลไม่สำเร็จ", {
          body: errorMessage,
          icon: "/favicon.ico"
        });
      }
    }
  }, [activeKey, dismissedKey, result, errorMessage]);

  // Request Notification permission on mount if idle
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => null);
    }
  }, []);

  if (!visible) return null;

  function handleClose() {
    if (activeKey) setDismissedKey(activeKey);
    onDismiss?.();
  }

  const isSuccess = Boolean(result && result.status === "completed");

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div
        className={`rounded-2xl border p-5 shadow-panel backdrop-blur-md transition ${
          isSuccess
            ? "border-brand/30 bg-white/95 text-ink"
            : "border-danger/30 bg-white/95 text-ink"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-white ${
                isSuccess ? "bg-brand" : "bg-danger"
              }`}
            >
              {isSuccess ? "✓" : "!"}
            </span>
            <div>
              <h4 className="text-sm font-semibold tracking-[-0.01em]">
                {isSuccess ? "นำเข้าข้อมูลสำเร็จเรียบร้อย" : "การนำเข้ามีข้อผิดพลาด"}
              </h4>
              <p className="mt-0.5 text-xs text-muted">
                {isSuccess && result
                  ? `ไฟล์: ${result.filename} (${result.processedRows} เรื่อง)`
                  : errorMessage || "ไม่สามารถประมวลผลไฟล์ได้"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-muted hover:bg-surface hover:text-ink"
            aria-label="ปิดการแจ้งเตือน"
          >
            ✕
          </button>
        </div>

        {isSuccess && result ? (
          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-success/10 p-2">
                <span className="block font-semibold text-success">{result.newTickets}</span>
                <span className="text-muted">เรื่องใหม่</span>
              </div>
              <div className="rounded-xl bg-warning/10 p-2">
                <span className="block font-semibold text-warning">{result.changedTickets}</span>
                <span className="text-muted">เปลี่ยนแปลง</span>
              </div>
              <div className="rounded-xl bg-surface p-2">
                <span className="block font-semibold text-ink">{result.unchangedTickets}</span>
                <span className="text-muted">คงเดิม</span>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface"
              >
                ปิด
              </button>
              <Link
                href={`/dashboard?import=${result.importBatchId}`}
                onClick={handleClose}
                className="rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-deep"
              >
                ดูสถิติบน Dashboard →
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
