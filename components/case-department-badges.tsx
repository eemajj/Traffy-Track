import React from "react";

type CaseDepartmentBadgesProps = {
  deptList: string[];
  layout?: "compact" | "detailed";
};

export function CaseDepartmentBadges({ deptList, layout = "detailed" }: CaseDepartmentBadgesProps) {
  if (!deptList || deptList.length === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-surface-strong px-3 py-1 text-xs font-semibold text-muted">
        ยังไม่มีฝ่ายรับผิดชอบ
      </span>
    );
  }

  const primaryDept = deptList[0];
  const coHandlingDepts = deptList.slice(1);

  if (coHandlingDepts.length === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-surface-strong px-3.5 py-1 text-xs font-semibold text-ink">
        {primaryDept}
      </span>
    );
  }

  if (layout === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 font-semibold text-brand">
          ฝ่ายหลัก: {primaryDept}
        </span>
        {coHandlingDepts.map((dept) => (
          <span key={dept} className="inline-flex items-center rounded-full border border-border bg-white px-2.5 py-1 font-semibold text-muted">
            👥 เชิญร่วม: {dept}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
          ฝ่ายหลัก: {primaryDept}
        </span>
        {coHandlingDepts.map((dept) => (
          <span
            key={dept}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-muted shadow-sm"
          >
            <span className="text-sm leading-none" aria-hidden="true">👥</span>
            เชิญร่วม: {dept}
          </span>
        ))}
      </div>
    </div>
  );
}
