"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  getAllowedReportTransitions,
  type ReportWorkflowStatus
} from "@/lib/workflow";
import type { ReportWorkflowEvent } from "@/lib/workflow";
import type { SessionRole } from "@/lib/session";

const STATUS_LABELS: Record<ReportWorkflowStatus, string> = {
  draft: "ร่าง",
  sent: "ส่งแล้ว",
  partially_returned: "ตีกลับบางส่วน",
  complete: "ครบถ้วน",
  locked: "ล็อกแล้ว"
};

export function ReportLifecyclePanel(props: {
  batchId: string;
  status: ReportWorkflowStatus;
  owner: string | null;
  dueDate: string | null;
  nextAction: string | null;
  role: SessionRole;
  history: ReportWorkflowEvent[];
}) {
  const router = useRouter();
  const [owner, setOwner] = useState(props.owner || "");
  const [dueDate, setDueDate] = useState(props.dueDate || "");
  const [nextAction, setNextAction] = useState(props.nextAction || "");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const transitions = getAllowedReportTransitions(props.status, props.role);
  const locked = props.status === "locked";

  async function mutate(body: Record<string, unknown>) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/workflow/reports/${props.batchId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, owner, dueDate: dueDate || null, nextAction, note })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "บันทึก workflow ไม่สำเร็จ");
      setMessage("บันทึกแล้ว");
      setNote("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึก workflow ไม่สำเร็จ");
    } finally {
      setPending(false);
    }
  }

  function saveMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({ operation: "metadata" });
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand">Workflow รายงาน</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">สถานะ: {STATUS_LABELS[props.status]}</h2>
          <p className="mt-2 text-sm text-muted">กำหนดเจ้าของ วันติดตาม และสิ่งที่ต้องทำต่อให้เห็นงานค้างจาก Action Center</p>
        </div>
        {locked ? <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">อ่านอย่างเดียว</span> : null}
      </div>

      <form onSubmit={saveMetadata} className="mt-5 grid gap-4 lg:grid-cols-3">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-ink">เจ้าของรายงาน</span>
          <input value={owner} onChange={(event) => setOwner(event.target.value)} disabled={locked || pending} required
            className="min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-sm text-ink disabled:opacity-60" placeholder="ชื่อหรือทีมผู้รับผิดชอบ" />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-ink">กำหนดติดตาม</span>
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={locked || pending}
            className="min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-sm text-ink disabled:opacity-60" />
        </label>
        <label className="space-y-2 lg:col-span-3">
          <span className="text-sm font-semibold text-ink">สิ่งที่ต้องทำต่อ</span>
          <textarea value={nextAction} onChange={(event) => setNextAction(event.target.value)} disabled={locked || pending} rows={3}
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink disabled:opacity-60" placeholder="เช่น ติดตามหลักฐานจากฝ่ายโยธา" />
        </label>
        <label className="space-y-2 lg:col-span-3">
          <span className="text-sm font-semibold text-ink">หมายเหตุการเปลี่ยนแปลง</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} disabled={locked || pending}
            className="min-h-12 w-full rounded-2xl border border-border bg-surface px-4 text-sm text-ink disabled:opacity-60" placeholder="ไม่บังคับ" />
        </label>
        {!locked ? (
          <div className="flex flex-wrap gap-3 lg:col-span-3">
            <button type="submit" disabled={pending} className="min-h-11 rounded-2xl border border-brand px-4 text-sm font-semibold text-brand disabled:opacity-60">
              {pending ? "กำลังบันทึก..." : "บันทึกผู้รับผิดชอบ"}
            </button>
            {transitions.map((status) => (
              <button key={status} type="button" disabled={pending} onClick={() => void mutate({ toStatus: status })}
                className="min-h-11 rounded-2xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">
                เปลี่ยนเป็น {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        ) : null}
      </form>
      {message ? <p role="status" className="mt-3 text-sm text-muted">{message}</p> : null}
      {props.history.length > 0 ? (
        <div className="mt-6 border-t border-border pt-5">
          <h3 className="text-sm font-semibold text-ink">ประวัติ Workflow</h3>
          <ol className="mt-3 space-y-2">
            {props.history.slice(0, 10).map((event) => (
              <li key={event.id} className="flex flex-col gap-1 rounded-xl bg-surface px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-ink">
                    {event.fromStatus ? `${STATUS_LABELS[event.fromStatus]} → ` : ""}{STATUS_LABELS[event.toStatus]}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {event.owner || "ยังไม่ระบุเจ้าของ"}{event.note ? ` · ${event.note}` : ""}
                  </p>
                </div>
                <time className="text-xs text-muted" dateTime={event.occurredAt}>
                  {new Intl.DateTimeFormat("th-TH", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Bangkok"
                  }).format(new Date(event.occurredAt))}
                </time>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
