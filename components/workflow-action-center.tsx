import Link from "next/link";

import type { WorkflowActionItem } from "@/lib/workflow";

export function WorkflowActionCenter({ items }: { items: WorkflowActionItem[] }) {
  if (items.length === 0) {
    return (
      <aside className="flex items-center gap-3 rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-sm text-success">
        <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
        ไม่มีงาน workflow ที่ค้างหรือเกินกำหนดสำหรับวันนี้
      </aside>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-ink">งานที่ต้องทำวันนี้</h2>
          <p className="mt-2 text-sm text-muted">รอบรายงานที่ครบกำหนดหรือยังขาดผู้รับผิดชอบและสิ่งที่ต้องทำต่อ</p>
        </div>
        <span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand">{items.length}</span>
      </div>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={`${item.itemType}-${item.resourceId}`}>
            <Link href={item.href}
              className="block rounded-xl border border-border bg-surface p-4 transition hover:border-brand/35 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{item.detail}</p>
                </div>
                <span className={item.isOverdue ? "text-xs font-semibold text-danger" : "text-xs font-semibold text-brand"}>
                  {item.isOverdue ? "เกินกำหนด" : item.dueDate ? `กำหนด ${item.dueDate}` : "ต้องจัดการ"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
