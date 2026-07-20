import Link from "next/link";
import type { ImportResult } from "@/lib/import/client-model";

export function ImportResultSummary({ result }: { result: ImportResult | null }) {
  if (!result) return null;
  const metrics = [
    { label: "แถวทั้งหมด", value: result.totalRows, className: "bg-surface", tone: "text-ink" },
    { label: "เรื่องใหม่", value: result.newTickets, className: "bg-success/10", tone: "text-success" },
    { label: "เรื่องที่เปลี่ยน", value: result.changedTickets, className: "bg-warning/10", tone: "text-warning" },
    { label: "เปิดกลับ", value: result.reopenedTickets, className: "border border-warning/25 bg-warning/10", tone: "text-warning" },
    { label: "ไม่เปลี่ยน", value: result.unchangedTickets, className: "bg-surface-strong", tone: "text-ink" }
  ];
  return (
    <section className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div><h2 className="text-xl font-semibold tracking-[-0.01em]">สรุปรอบการนำเข้าล่าสุด</h2><p className="mt-2 text-sm text-muted">รหัสรอบนำเข้า: <span className="font-mono text-xs">{result.importBatchId}</span></p></div>
        <p className="rounded-full bg-brand/10 px-4 py-2 text-sm font-semibold text-brand">{result.filename}</p>
      </div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map((metric) => <div key={metric.label} className={`rounded-2xl p-4 ${metric.className}`}><dt className={`text-sm ${metric.tone}`}>{metric.label}</dt><dd className={`mt-2 text-3xl font-semibold ${metric.tone}`}>{metric.value}</dd></div>)}
      </dl>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface px-4 py-3"><dt className="text-muted">เรื่องที่ประมวลผลจริง</dt><dd className="mt-1 font-semibold text-ink">{result.processedRows}</dd></div>
        <div className="rounded-2xl border border-border bg-surface px-4 py-3"><dt className="text-muted">แถว ticket ซ้ำที่ข้าม</dt><dd className="mt-1 font-semibold text-ink">{result.duplicateRows}</dd></div>
        <div className="rounded-2xl border border-border bg-surface px-4 py-3"><dt className="text-muted">ช่องข้อมูลที่เปลี่ยนในเรื่องเดิม</dt><dd className="mt-1 font-semibold text-ink">{result.changedFields}</dd></div>
      </dl>
      <div className="mt-6"><Link href={`/dashboard?import=${result.importBatchId}`} className="inline-flex rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-deep hover:shadow-hover">เปิดหน้าสรุปล่าสุด</Link></div>
    </section>
  );
}
