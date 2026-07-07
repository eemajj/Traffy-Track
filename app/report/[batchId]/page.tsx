import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ReportDepartmentChecklist } from "@/app/report/[batchId]/report-department-checklist";
import { getReportBatchDetailData } from "@/lib/report";

export const dynamic = "force-dynamic";

type ReportBatchDetailPageProps = {
  params: {
    batchId: string;
  };
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export default async function ReportBatchDetailPage({ params }: ReportBatchDetailPageProps) {
  const data = await getReportBatchDetailData(params.batchId);

  if (data.status === "not_found") {
    notFound();
  }

  const departmentEvidenceKey =
    data.status === "ready"
      ? data.departments
          .map((department) => `${department.id}:${department.evidence_uploaded_at || ""}`)
          .join("|")
      : params.batchId;

  return (
    <AppShell
      title={data.status === "ready" ? `รอบรายงาน ${formatDate(data.batch.report_date)}` : `รอบรายงาน ${params.batchId}`}
      description="ตรวจรายการฝ่ายในรอบนี้ ดูรายการเรื่องของแต่ละฝ่าย ดาวน์โหลด Excel ต่อฝ่าย และอัปโหลดหลักฐานได้จากหน้าเดียวกัน"
    >
      {data.status === "missing_env" ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-bold text-amber-900">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-amber-900/80">
            ต้องมี `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` ใน `.env.local` ก่อนจึงจะเปิดรอบรายงานนี้ได้
          </p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-3xl border border-warning/20 bg-[rgba(201,131,34,0.12)] p-6">
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
            <div className="rounded-2xl border border-border bg-white px-4 py-3 text-sm text-muted">
              <Link
                href={`/api/report/${params.batchId}/export-all`}
                className="font-semibold text-brand transition hover:text-brand-deep"
              >
                ดาวน์โหลด Excel ทั้งหมด
              </Link>{" "}
              หรือจัดการไฟล์ Excel และหลักฐานแยกตามฝ่ายด้านล่าง
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
              <p className="text-sm text-muted">วันที่ของรอบ</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{formatDate(data.batch.report_date)}</p>
            </section>
            <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
              <p className="text-sm text-muted">จำนวนฝ่าย</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{data.departmentCount}</p>
            </section>
            <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
              <p className="text-sm text-muted">รายการเรื่องในรอบ</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{data.itemCount}</p>
            </section>
            <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
              <p className="text-sm text-muted">หลักฐานที่อัปโหลดแล้ว</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{data.evidenceUploadedCount}</p>
            </section>
          </div>

          <ReportDepartmentChecklist
            key={departmentEvidenceKey}
            batchId={params.batchId}
            initialDepartments={data.departments.map((department) => ({
              id: department.id,
              dept_name: department.dept_name,
              evidence_file_url: department.evidence_file_url,
              evidence_uploaded_at: department.evidence_uploaded_at,
              itemCount: department.itemCount
            }))}
          />

          <section className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">รายการเรื่องตามฝ่าย</h2>
              <p className="text-sm leading-6 text-muted">
                รายการด้านล่างเป็นข้อมูล ณ เวลาที่สร้างรอบรายงานนี้ ข้อมูลในรอบนี้จึงไม่เปลี่ยนแม้ทะเบียนเรื่องปัจจุบันจะอัปเดตภายหลัง
              </p>
            </div>

            {data.departments.map((department) => (
              <section key={department.id} className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
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
