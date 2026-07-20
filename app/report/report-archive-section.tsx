import type { ReportPageData } from "@/lib/report";
import { formatReportDate, formatReportDateTime, formatReportNumber, getArchiveEvidenceBadge } from "@/lib/report/page-model";

type Archive = Extract<ReportPageData, { status: "ready" }>["archives"][number];

function ArchiveDepartment({ archive, department }: { archive: Archive; department: Archive["departments"][number] }) {
  const badge = getArchiveEvidenceBadge(department.evidenceReviewStatus, department.evidenceUploaded, archive.evidenceSemantics === "legacy_uploaded_v0");
  return (
    <div className="rounded-2xl bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold leading-6 text-ink">{department.deptName}</p><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}>{badge.label}</span></div>
      <p className="mt-2 text-xs leading-5 text-muted">{formatReportNumber(department.itemCount)} เรื่อง{department.evidenceUploadedAt ? ` · ${formatReportDateTime(department.evidenceUploadedAt)}` : ""}</p>
    </div>
  );
}

export function ReportArchiveSection({ archives }: { archives: Archive[] }) {
  return (
    <section className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">ประวัติรอบรายงาน</h2><p className="mt-2 text-sm leading-6 text-muted">Archive summary สำหรับดูย้อนหลังหลังล้าง report batch หรือไฟล์หลักฐานออกจาก Storage แล้ว</p></div>
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-muted">{formatReportNumber(archives.length)} archives</span>
      </div>
      <div className="mt-5 space-y-4">{archives.length === 0 ? (
        <div className="rounded-2xl bg-surface p-5 text-sm leading-6 text-muted">ยังไม่มี archive รอบรายงาน กด “บันทึก Archive” เพื่อเก็บประวัติจากรอบรายงานปัจจุบัน</div>
      ) : archives.map((archive) => (
        <article key={archive.id} className="rounded-2xl border border-border bg-surface/55 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-brand">{formatReportDate(archive.reportDate)}</p><span className={`rounded-full border px-3 py-1 text-xs font-semibold ${archive.completionStatus === "complete" ? "border-success/25 bg-success/10 text-success" : "border-danger/25 bg-danger/10 text-danger"}`}>{archive.completionStatus === "complete" ? "อนุมัติครบ" : "ยังไม่อนุมัติครบ"}</span>{archive.evidenceSemantics === "legacy_uploaded_v0" ? <span className="rounded-full border border-warning/25 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">Archive เดิม—รอยืนยันย้อนหลัง</span> : null}{archive.sourceDeleted ? <span className="rounded-full border border-warning/25 bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">ล้าง source แล้ว</span> : null}</div>
              <h3 className="mt-2 text-lg font-semibold tracking-[-0.01em] text-ink">Archive รอบรายงานวันที่ {formatReportDate(archive.reportDate)}</h3><p className="mt-1 text-sm text-muted">เก็บเมื่อ {formatReportDateTime(archive.archivedAt)} · สร้างรอบเดิมเมื่อ {formatReportDateTime(archive.reportCreatedAt)}</p>{archive.note ? <p className="mt-2 text-sm leading-6 text-ink">{archive.note}</p> : null}</div>
            <div className="rounded-2xl bg-white px-4 py-3 text-sm text-muted"><p className="font-semibold text-ink">{archive.evidenceSemantics === "approved_v1" ? `${formatReportNumber(archive.evidenceApprovedCount)}/${formatReportNumber(archive.departmentCount)} ฝ่ายอนุมัติแล้ว` : `${formatReportNumber(archive.evidenceUploadedCount)}/${formatReportNumber(archive.departmentCount)} ฝ่ายมีไฟล์ตามเกณฑ์เดิม`}</p><p className="mt-1">รวม {formatReportNumber(archive.itemCount)} รายการเรื่อง</p></div>
          </div>
          {archive.evidenceSemantics === "approved_v1" ? <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded-full bg-warning/10 px-3 py-1 text-warning">ยังไม่ส่ง {formatReportNumber(archive.evidenceMissingCount)}</span><span className="rounded-full bg-warning/10 px-3 py-1 text-warning">รอตรวจ {formatReportNumber(archive.evidencePendingReviewCount)}</span><span className="rounded-full bg-danger/10 px-3 py-1 text-danger">ตีกลับ {formatReportNumber(archive.evidenceRejectedCount)}</span><span className="rounded-full bg-success/10 px-3 py-1 text-success">อนุมัติ {formatReportNumber(archive.evidenceApprovedCount)}</span></div> : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{archive.departments.map((department) => <ArchiveDepartment key={`${archive.id}-${department.deptName}`} archive={archive} department={department} />)}</div>
        </article>
      ))}</div>
    </section>
  );
}
