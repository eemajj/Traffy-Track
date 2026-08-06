import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ReportDepartmentChecklist } from "@/app/report/[batchId]/report-department-checklist";
import { ReportLifecyclePanel } from "@/app/report/[batchId]/report-lifecycle-panel";
import { getReportBatchDetailData } from "@/lib/report";
import { formatReportDate as formatDate, formatReportDateTime as formatDateTime } from "@/lib/report/page-model";
import { getCurrentSessionClaims } from "@/lib/auth";
import { getReportWorkflowHistory } from "@/lib/workflow";

export const dynamic = "force-dynamic";

type ReportBatchDetailPageProps = {
  params: Promise<{
    batchId: string;
  }>;
};

export default async function ReportBatchDetailPage(props: ReportBatchDetailPageProps) {
  const params = await props.params;
  const [data, claims] = await Promise.all([
    getReportBatchDetailData(params.batchId),
    getCurrentSessionClaims()
  ]);
  const workflowHistory = data.status === "ready" ? await getReportWorkflowHistory(params.batchId) : [];

  if (data.status === "not_found") {
    notFound();
  }

  const departmentEvidenceKey =
    data.status === "ready"
      ? data.departments
          .map((department) => `${department.id}:${department.current_evidence_version_id || ""}:${department.evidence_review_status || ""}`)
          .join("|")
      : params.batchId;

  return (
    <AppShell
      title={data.status === "ready" ? `รอบรายงาน ${formatDate(data.batch.report_date)}` : `รอบรายงาน ${params.batchId}`}
      description="ตรวจรายการฝ่ายในรอบนี้ ดูรายการเรื่องของแต่ละฝ่าย ดาวน์โหลด Excel ต่อฝ่าย และอัปโหลดหลักฐานได้จากหน้าเดียวกัน"
    >
      {data.status === "missing_env" ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-bold text-amber-900">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-amber-900/80">
            ต้องมี `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` ใน `.env.local` ก่อนจึงจะเปิดรอบรายงานนี้ได้
          </p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-2xl border border-warning/20 bg-[rgba(201,131,34,0.12)] p-6">
          <h2 className="text-xl font-bold text-warning">รอบรายงานนี้ยังดึงข้อมูลไม่ได้ชั่วคราว</h2>
          <p className="mt-3 text-sm leading-6 text-warning">{data.message}</p>
        </section>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <Link href="/report" className="text-sm font-semibold text-brand">
                ย้อนกลับไปหน้ารอบรายงาน
              </Link>
              <p className="text-sm text-muted">สร้างเมื่อ {formatDateTime(data.batch.created_at)}</p>
              {data.batch.note ? <p className="text-sm leading-6 text-ink">{data.batch.note}</p> : null}
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-brand/20 bg-brand/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-ink">📦 ชุดเอกสารรายงานผู้บริหารครบถ้วน (1-Click Executive Package)</p>
                <p className="mt-0.5 text-xs text-muted">รวมไฟล์ PDF สรุปภาพรวมเขต + PDF รายฝ่าย + Excel รายฝ่าย ครบถ้วนในไฟล์ ZIP เดียว</p>
              </div>
              <a
                href={`/api/report/${params.batchId}/export-all`}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep"
              >
                <span>📦</span> ดาวน์โหลดชุดผู้บริหาร (ZIP)
              </a>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
            <section className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
              <p className="text-sm text-muted">วันที่ของรอบ</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{formatDate(data.batch.report_date)}</p>
            </section>
            <section className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
              <p className="text-sm text-muted">จำนวนฝ่าย</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{data.departmentCount}</p>
            </section>
            <section className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
              <p className="text-sm text-muted">รายการเรื่องในรอบ</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{data.itemCount}</p>
            </section>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-sm text-muted">ยังไม่ส่ง</p>
              <p className="mt-2 text-2xl font-semibold text-warning">{data.evidenceMissingCount}</p>
            </section>
            <section className="rounded-2xl border border-border bg-surface p-5">
              <p className="text-sm text-muted">รอตรวจ</p>
              <p className="mt-2 text-2xl font-semibold text-warning">{data.evidencePendingReviewCount}</p>
            </section>
            <section className="rounded-2xl border border-danger/20 bg-danger/5 p-5">
              <p className="text-sm text-danger">ตีกลับให้แก้</p>
              <p className="mt-2 text-2xl font-semibold text-danger">{data.evidenceRejectedCount}</p>
            </section>
            <section className="rounded-2xl border border-success/20 bg-success/5 p-5">
              <p className="text-sm text-success">อนุมัติแล้ว</p>
              <p className="mt-2 text-2xl font-semibold text-success">{data.evidenceApprovedCount}/{data.departmentCount}</p>
            </section>
          </div>

          <ReportLifecyclePanel
            batchId={params.batchId}
            status={data.batch.lifecycle_status || "draft"}
            owner={data.batch.owner || null}
            dueDate={data.batch.due_date || null}
            nextAction={data.batch.next_action || null}
            role={claims?.role || "operator"}
            history={workflowHistory}
          />

          <ReportDepartmentChecklist
            key={departmentEvidenceKey}
            batchId={params.batchId}
            initialDepartments={data.departments.map((department) => ({
              id: department.id,
              dept_name: department.dept_name,
              evidence_file_url: department.evidence_file_url,
              evidence_uploaded_at: department.evidence_uploaded_at,
              current_evidence_version_id: department.current_evidence_version_id,
              evidence_review_status: department.evidence_review_status,
              evidence_review_note: department.evidence_review_note,
              evidence_version_number: department.evidence_version_number,
              evidence_original_filename: department.evidence_original_filename,
              itemCount: department.itemCount
            }))}
            canManageEvidence={claims?.role === "admin"}
          />

          <section className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">รายการเรื่องตามฝ่าย</h2>
              <p className="text-sm leading-6 text-muted">
                รายการด้านล่างเป็นข้อมูล ณ เวลาที่สร้างรอบรายงานนี้ ข้อมูลในรอบนี้จึงไม่เปลี่ยนแม้ทะเบียนเรื่องปัจจุบันจะอัปเดตภายหลัง
              </p>
            </div>

            {data.departments.map((department) => (
              <section key={department.id} className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold tracking-[-0.01em] text-ink">{department.dept_name}</h3>
                    <p className="text-sm text-muted">{department.itemCount} เรื่องในรอบนี้</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {department.tickets.length === 0 ? (
                    <div className="rounded-2xl bg-surface p-4 text-sm text-muted">ไม่มีรายการเรื่องในฝ่ายนี้</div>
                  ) : (
                    department.tickets.map((ticket) => (
                      <article key={`${department.id}-${ticket.ticket_id}`} className="rounded-2xl bg-surface p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <p className="font-mono text-xs text-muted">{ticket.ticket_id}</p>
                            <h4 className="text-sm font-semibold text-ink">{ticket.state || "ไม่ระบุสถานะ"}</h4>
                            <p className="text-sm leading-6 text-ink">{ticket.comment || "-"}</p>
                            <p className="text-xs leading-5 text-muted">{ticket.address || ticket.org_response || "-"}</p>
                          </div>
                          <div className="grid gap-2 text-xs text-muted sm:grid-cols-2 lg:min-w-[280px]">
                            <div className="rounded-xl bg-white px-3 py-2">แจ้งเมื่อ {formatDateTime(ticket.timestamp)}</div>
                            <div className="rounded-xl bg-white px-3 py-2">อัปเดตล่าสุด {formatDateTime(ticket.last_activity)}</div>
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ))}
          </section>
        </div>
      )}
    </AppShell>
  );
}
