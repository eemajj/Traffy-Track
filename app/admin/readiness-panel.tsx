"use client";

import { useState } from "react";

import type { SystemNotification } from "@/lib/notifications";

export function OperationalReadinessPanel({
  maintenanceEnabled: initialEnabled,
  maintenanceMessage: initialMessage,
  notifications
}: {
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  notifications: SystemNotification[];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState(initialMessage);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function updateMaintenance(nextEnabled: boolean) {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled, message })
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "เปลี่ยนสถานะไม่สำเร็จ");
      setEnabled(nextEnabled);
      setFeedback(nextEnabled ? "เปิดโหมดอ่านอย่างเดียวแล้ว" : "เปิดการแก้ไขข้อมูลตามปกติแล้ว");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "เปลี่ยนสถานะไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  return (
    <section id="notifications" className="rounded-2xl bg-white p-6 shadow-panel">
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div>
          <h2 className="text-xl font-semibold text-ink">โหมดบำรุงรักษา</h2>
          <p className="mt-2 text-sm leading-6 text-muted">ปิดการเขียนข้อมูลชั่วคราว โดยผู้ใช้งานยังเปิด Dashboard, Analytics และแผนที่ได้</p>
          <label htmlFor="maintenance-message" className="mt-4 block text-sm font-semibold text-ink">ข้อความที่แสดงแก่ผู้ใช้งาน</label>
          <textarea id="maintenance-message" value={message} onChange={(event) => setMessage(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" />
          <button type="button" disabled={pending} onClick={() => updateMaintenance(!enabled)} className={enabled ? "mt-3 min-h-11 rounded-2xl bg-success px-5 py-3 text-sm font-semibold text-white" : "mt-3 min-h-11 rounded-2xl bg-warning px-5 py-3 text-sm font-semibold text-white"}>
            {pending ? "กำลังบันทึก..." : enabled ? "ปิดโหมดบำรุงรักษา" : "เปิดโหมดอ่านอย่างเดียว"}
          </button>
          {feedback ? <p role="status" className="mt-3 text-sm font-semibold text-muted">{feedback}</p> : null}
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-ink">การแจ้งเตือนระบบ</h2>
            <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold text-muted">{notifications.length} รายการ</span>
          </div>
          <div className="mt-4 space-y-3">
            {notifications.length === 0 ? <p className="rounded-2xl bg-success/10 px-4 py-4 text-sm font-semibold text-success">ไม่มีเหตุผิดปกติที่ต้องดำเนินการ</p> : notifications.map((item) => (
              <a key={item.id} href={item.href || "/admin"} className={item.severity === "critical" ? "block rounded-2xl bg-danger/5 p-4 text-danger" : "block rounded-2xl bg-warning/10 p-4 text-warning"}>
                <p className="font-semibold">{item.title}</p>
                <p className="mt-1 text-sm leading-6">{item.message}</p>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
