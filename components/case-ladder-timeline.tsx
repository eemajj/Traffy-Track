import React from "react";
import type { CaseTimelineItem } from "@/lib/cases";

type CaseLadderTimelineProps = {
  items: CaseTimelineItem[];
  deptList: string[];
};

export function CaseLadderTimeline({ items, deptList }: CaseLadderTimelineProps) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl bg-surface p-6 text-center text-sm text-muted">
        ยังไม่มีประวัติบันทึกไทม์ไลน์ในระบบ
      </div>
    );
  }

  const primaryDept = deptList[0] || null;
  const coHandlingDepts = deptList.slice(1);

  return (
    <div className="rounded-2xl bg-white p-6 shadow-panel">
      <div className="flex items-center justify-between border-b border-border/80 pb-4">
        <div>
          <h3 className="text-lg font-bold tracking-[-0.01em] text-ink"> Ladder Timeline (ไทม์ไลน์ขั้นบันได)</h3>
          <p className="mt-1 text-xs text-muted">ลำดับเหตุการณ์ การเชิญร่วม และพัฒนาการของเรื่องตามเวลาจริง</p>
        </div>
        <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
          {deptList.length > 1 ? `${deptList.length} ฝ่ายร่วมดำเนินการ` : "1 ฝ่ายรับผิดชอบ"}
        </span>
      </div>

      <div className="relative mt-6 pl-6">
        {/* Ladder Vertical Connecting Line */}
        <div
          className="absolute bottom-3 left-2.5 top-3 w-0.5 bg-gradient-to-b from-brand via-brand/40 to-border"
          aria-hidden="true"
        />

        <div className="space-y-6">
          {items.map((item, index) => {
            const isLatest = index === items.length - 1;
            const dateStr = item.detected_at
              ? new Intl.DateTimeFormat("th-TH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Asia/Bangkok"
                }).format(new Date(item.detected_at))
              : "-";

            let stepLabel = "อัปเดตข้อมูล";
            let stepTone = "border-border bg-white text-ink";
            let dotColor = "bg-muted";

            if (item.changed_field === "new_ticket") {
              stepLabel = primaryDept ? `รับเรื่องตั้งต้น (${primaryDept})` : "รับเรื่องตั้งต้นเข้าระบบ";
              stepTone = "border-brand/30 bg-brand/5 text-brand font-bold";
              dotColor = "bg-brand ring-4 ring-brand/20";
            } else if (item.changed_field === "org_response" && coHandlingDepts.length > 0) {
              stepLabel = `เชิญร่วมดำเนินการ (${coHandlingDepts.join(", ")})`;
              stepTone = "border-warning/30 bg-warning/10 text-warning font-semibold";
              dotColor = "bg-warning ring-4 ring-warning/20";
            } else if (item.changed_field === "state") {
              stepLabel = `เปลี่ยนสถานะเป็น "${item.new_value || ""}"`;
              stepTone = isLatest ? "border-success/30 bg-success/10 text-success font-bold" : "border-border bg-white text-ink";
              dotColor = isLatest ? "bg-success ring-4 ring-success/20" : "bg-brand/60";
            }

            return (
              <div key={item.id || index} className="relative flex items-start gap-4">
                {/* Node Dot on Ladder Line */}
                <div className={`absolute -left-6 top-1.5 h-3.5 w-3.5 rounded-full transition ${dotColor}`} />

                <div className={`w-full rounded-2xl border p-4 shadow-sm ${stepTone}`}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-mono text-xs font-semibold tracking-wider opacity-75">
                      ขั้นที่ {index + 1} · {dateStr}
                    </span>
                    <span className="text-xs opacity-70">
                      {item.import_batches?.filename ? `จากรอบ ${item.import_batches.filename}` : ""}
                    </span>
                  </div>

                  <h4 className="mt-1 text-sm font-semibold leading-6">{stepLabel}</h4>

                  {item.changed_field !== "new_ticket" && (item.old_value || item.new_value) ? (
                    <p className="mt-1 text-xs opacity-80">
                      {item.old_value ? `เดิม: "${item.old_value}" ➔ ` : null}
                      {`ปัจจุบัน: "${item.new_value || ""}"`}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
