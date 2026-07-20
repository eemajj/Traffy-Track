import { AppShell } from "@/components/app-shell";
import {
  createReportBatchAction,
} from "@/app/report/actions";
import { CreateReportSubmitButton } from "@/app/report/create-report-submit-button";
import { ReportBatchList } from "@/app/report/report-batch-list";
import { ReportOverview } from "@/app/report/report-overview";
import { ReportArchiveSection } from "@/app/report/report-archive-section";
import { getReportPageData } from "@/lib/report";
import { getBangkokCurrentMonthRange, getBangkokTodayValue } from "@/lib/report-date";

export const dynamic = "force-dynamic";

type ReportPageProps = {
  searchParams?: Promise<{
    status?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
};

export default async function ReportPage(props: ReportPageProps) {
  const searchParams = await props.searchParams;
  const data = await getReportPageData(searchParams);
  const currentMonth = getBangkokCurrentMonthRange();

  return (
    <AppShell
      title="รอบรายงาน"
      description="สร้างรอบรายงานจากเรื่องคงค้างจริง แล้วติดตามความคืบหน้าของแต่ละฝ่ายในหน้าเดียว"
    >
      {data.status === "missing_env" ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h2 className="text-xl font-bold text-amber-900">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-amber-900/80">
            ต้องมี `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` ใน `.env.local` ก่อนจึงจะใช้งานรอบรายงานได้
          </p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-2xl border border-warning/20 bg-[rgba(201,131,34,0.12)] p-6">
          <h2 className="text-xl font-bold text-warning">รอบรายงานยังดึงข้อมูลไม่ได้ชั่วคราว</h2>
          <p className="mt-3 text-sm leading-6 text-warning">{data.message}</p>
        </section>
      ) : (
        <div className="space-y-6">
          <ReportOverview
            pendingTicketCount={data.pendingTicketCount}
            departmentsReadyCount={data.departmentsReadyCount}
            unassignedPendingCount={data.unassignedPendingCount}
            batchCount={data.batches.length}
          />

          <section className="rounded-2xl border border-brand/20 bg-surface p-5 sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">ออกรายงานสรุปตามช่วงวันที่</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  สร้าง PDF ตามรูปแบบรายงาน Traffy Fondue พร้อมสถิติภาพรวมและรายการคงค้างแยกฝ่าย
                  โดยอ้างอิงวันที่รับแจ้งและสถานะล่าสุดใน CityData
                </p>
              </div>
              <form
                action="/api/report/summary-pdf"
                method="get"
                className="grid w-full gap-3 sm:grid-cols-[1fr_1fr_auto] xl:max-w-2xl"
              >
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink">ตั้งแต่วันที่</span>
                  <input
                    type="date"
                    name="from"
                    defaultValue="2022-05-22"
                    max={getBangkokTodayValue()}
                    required
                    className="min-h-12 w-full rounded-2xl border border-border bg-white px-4 text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-ink">ถึงวันที่</span>
                  <input
                    type="date"
                    name="to"
                    defaultValue={getBangkokTodayValue()}
                    max={getBangkokTodayValue()}
                    required
                    className="min-h-12 w-full rounded-2xl border border-border bg-white px-4 text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
                  />
                </label>
                <button
                  type="submit"
                  className="min-h-12 self-end rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-deep focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
                >
                  ดาวน์โหลด PDF
                </button>
              </form>
            </div>
            <p className="mt-4 text-xs leading-5 text-muted">
              หมายเหตุ: ช่วงวันที่ใช้วันที่รับแจ้ง ส่วนสถานะและหน่วยงานเป็นข้อมูลล่าสุด ณ เวลาที่ดาวน์โหลด
            </p>
          </section>

          <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <section className="rounded-2xl border border-border/80 bg-white p-6 shadow-panel">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-[-0.01em] text-ink">สร้างรอบรายงานใหม่</h2>
                <p className="text-sm leading-6 text-muted">
                  ระบบจะบันทึกภาพรวมเรื่องคงค้าง ณ เวลานั้น และแยกรายการตามฝ่ายที่ได้รับจาก CityData โดยไม่แก้ไขข้อมูลเคส
                </p>
              </div>

              <form action={createReportBatchAction} className="mt-6 space-y-4">
                <input type="hidden" name="idempotency_key" value={crypto.randomUUID()} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-ink">วันที่ของรอบรายงาน</span>
                    <input
                      type="date"
                      name="report_date"
                      defaultValue={getBangkokTodayValue()}
                      required
                      className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-ink outline-none focus:border-brand focus:bg-white focus:shadow-[0_0_0_4px_var(--ring)]"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-ink">หมายเหตุ</span>
                    <input
                      type="text"
                      name="note"
                      placeholder="เช่น รอบติดตามกลางเดือน"
                      className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-ink outline-none focus:border-brand focus:bg-white focus:shadow-[0_0_0_4px_var(--ring)]"
                    />
                  </label>
                </div>

                <CreateReportSubmitButton />
              </form>

              <div className="mt-6 rounded-2xl bg-surface p-4">
                <h3 className="text-sm font-semibold text-ink">ฝ่ายที่พร้อมออกรายงานตอนนี้</h3>
                <div className="mt-3 space-y-2">
                  {data.pendingDepartments.length === 0 ? (
                    <p className="text-sm text-muted">ยังไม่มีฝ่ายที่มีเรื่องคงค้างสำหรับการออกรายงาน</p>
                  ) : (
                    data.pendingDepartments.map((department) => (
                      <div
                        key={department.dept_name}
                        className="flex items-center justify-between rounded-2xl border border-white/70 bg-white/80 px-4 py-3"
                      >
                        <p className="pr-4 text-sm font-medium text-ink">{department.dept_name}</p>
                        <span className="rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white">
                          {department.pending_count}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <ReportBatchList data={data} currentMonth={currentMonth} />          </div>

          <ReportArchiveSection archives={data.archives} />
        </div>
      )}
    </AppShell>
  );
}
