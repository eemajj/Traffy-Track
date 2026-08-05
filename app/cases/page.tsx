import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { CaseDepartmentBadges } from "@/components/case-department-badges";
import { CaseListItem, getCaseListData } from "@/lib/cases";
import {
  buildCasesHref,
  casePageSizeOptions as pageSizeOptions,
  caseSortLabels as sortLabels,
  caseViewLabels as viewLabels,
  caseViews as views,
  formatCaseDateTime as formatDateTime,
  formatCaseDepartments as formatDeptList,
  formatCaseNumber as formatNumber,
  formatCaseOrgResponse as formatOrgResponse,
  getCaseStatusClassName as getStatusClassName
} from "@/lib/cases/page-model";

export const dynamic = "force-dynamic";

type CasesPageProps = {
  searchParams?: Promise<{
    view?: string;
    q?: string;
    state?: string;
    dept?: string;
    role?: string;
    sort?: string;
    page?: string;
    pageSize?: string;
  }>;
};

function CaseCard({ item }: { item: CaseListItem }) {
  return (
    <article className="rounded-2xl border border-border/80 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/cases/${encodeURIComponent(item.ticket_id)}`} className="font-mono text-sm font-semibold text-brand hover:text-brand-deep">
              {item.ticket_id}
            </Link>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClassName(item.state)}`}>
              {item.state || "ไม่ระบุสถานะ"}
            </span>
            {item.reopenedInLatestBatch ? (
              <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                เปิดกลับ
              </span>
            ) : item.latestStateChange ? (
              <span className="rounded-full bg-danger/10 px-3 py-1 text-xs font-semibold text-danger">
                สถานะเปลี่ยน
              </span>
            ) : null}
          </div>
          <h2 className="mt-3 text-base font-semibold leading-6 text-ink">{item.comment || "ไม่มีรายละเอียดปัญหา"}</h2>
          <p className="mt-2 text-sm leading-6 text-muted">{item.address || "-"}{item.subdistrict ? `, ${item.subdistrict}` : ""}</p>
        </div>
        <div className="shrink-0 space-y-3 rounded-2xl bg-surface px-4 py-3 text-sm text-muted lg:min-w-56">
          <div>
            <p>วันที่รับแจ้ง</p>
            <p className="mt-1 font-semibold text-ink">{formatDateTime(item.timestamp)}</p>
          </div>
          <div className="border-t border-border pt-3">
            <p>อัปเดตล่าสุด</p>
            <p className="mt-1 font-semibold text-ink">{formatDateTime(item.last_activity)}</p>
          </div>
        </div>
      </div>

      {item.latestStateChange ? (
        <div className="mt-4 rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm leading-6 text-ink">
          <span className="font-semibold text-warning">
            {item.reopenedInLatestBatch ? "เปิดกลับรอบล่าสุด" : "สถานะเปลี่ยนรอบล่าสุด"}
          </span>
          <span className="mx-2 text-muted">จาก</span>
          <span>{item.latestStateChange.old_value || "-"}</span>
          <span className="mx-2 text-muted">{item.reopenedInLatestBatch ? "กลับเป็น" : "เป็น"}</span>
          <span>{item.latestStateChange.new_value || "-"}</span>
          <span className="mx-2 text-muted">เมื่อ</span>
          <span>{formatDateTime(item.latestStateChange.detected_at)}</span>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div className="rounded-2xl bg-surface px-4 py-3">
          <p className="text-xs font-semibold text-muted">ฝ่ายรับผิดชอบ</p>
          <div className="mt-1.5">
            <CaseDepartmentBadges deptList={item.dept_list} />
          </div>
        </div>
        <div className="rounded-2xl bg-surface px-4 py-3">
          <p className="text-xs font-semibold text-muted">หน่วยงานในข้อมูล</p>
          <p className="mt-1 leading-6 text-ink">{formatOrgResponse(item.org_response)}</p>
        </div>
      </div>
    </article>
  );
}

export default async function CasesPage(props: CasesPageProps) {
  const searchParams = (await props.searchParams) ?? {};
  const data = await getCaseListData(searchParams);

  return (
    <AppShell
      title="ทะเบียนเรื่อง"
      description="ค้นหาเรื่อง กรองตามฝ่ายหรือสถานะ และดูเรื่องที่เปลี่ยนสถานะจากรอบนำเข้าล่าสุด"
    >
      {data.status === "missing_env" ? (
        <section className="rounded-2xl border border-warning/20 bg-warning/10 p-6">
          <h2 className="text-xl font-bold text-warning">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-warning">ต้องตั้งค่า Supabase admin env ก่อนจึงจะดูทะเบียนเรื่องได้</p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-2xl border border-danger/20 bg-danger/5 p-6">
          <h2 className="text-xl font-bold text-danger">ทะเบียนเรื่องดึงข้อมูลไม่ได้ชั่วคราว</h2>
          <p className="mt-3 text-sm leading-6 text-danger">{data.message}</p>
        </section>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-5 shadow-panel">
            <div className="flex flex-wrap gap-2">
              {views.map((view) => (
                <Link
                  key={view}
                  href={buildCasesHref({
                    view,
                    q: data.q,
                    state: data.state,
                    dept: data.dept,
                    sort: data.sort,
                    pageSize: data.pageSize
                  })}
                  aria-current={view === data.view ? "page" : undefined}
                  className={
                    view === data.view
                      ? "inline-flex min-h-11 items-center rounded-2xl bg-brand px-4 py-2.5 text-sm font-semibold text-white"
                      : "inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:border-brand/35 hover:bg-white hover:text-brand"
                  }
                >
                  {viewLabels[view]}
                </Link>
              ))}
            </div>

            <form className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_0.72fr_auto]" action="/cases">
              <input type="hidden" name="view" value={data.view} />
              <label className="sr-only" htmlFor="cases-query">ค้นหาเรื่อง</label>
              <input
                id="cases-query"
                name="q"
                defaultValue={data.q}
                placeholder="ค้นหารหัสเรื่อง รายละเอียด ที่อยู่ หรือหน่วยงาน"
                className="min-h-12 rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
              />
              <label className="sr-only" htmlFor="cases-state">สถานะเรื่อง</label>
              <select
                id="cases-state"
                name="state"
                defaultValue={data.state}
                className="min-h-12 rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
              >
                <option value="">ทุกสถานะ</option>
                {data.stateOptions.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="cases-department">ฝ่ายรับผิดชอบ</label>
              <select
                id="cases-department"
                name="dept"
                defaultValue={data.dept}
                className="min-h-12 rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
              >
                <option value="">ทุกฝ่าย</option>
                {data.departmentOptions.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="cases-role">บทบาทฝ่าย</label>
              <select
                id="cases-role"
                name="role"
                defaultValue={data.role || ""}
                className="min-h-12 rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
              >
                <option value="">ทุกบทบาท (หลัก + เชิญร่วม)</option>
                <option value="primary">🏷️ เฉพาะเรื่องรับผิดชอบหลัก</option>
                <option value="cohandling">👥 เฉพาะเรื่องที่ถูกเชิญร่วม</option>
              </select>
              <label className="sr-only" htmlFor="cases-sort">เรียงลำดับ</label>
              <select
                id="cases-sort"
                name="sort"
                defaultValue={data.sort}
                className="min-h-12 rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
              >
                {Object.entries(sortLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="cases-page-size">จำนวนรายการต่อหน้า</label>
              <select
                id="cases-page-size"
                name="pageSize"
                defaultValue={data.pageSize}
                className="min-h-12 rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)]"
              >
                {pageSizeOptions.map((pageSize) => (
                  <option key={pageSize} value={pageSize}>
                    {pageSize} รายการ/หน้า
                  </option>
                ))}
              </select>
              <button className="min-h-12 rounded-2xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep" type="submit">
                ค้นหา
              </button>
            </form>

            <div className="mt-4 flex flex-col gap-2 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
              <p>
                พบ {formatNumber(data.totalCount)} เรื่องในมุมมอง {viewLabels[data.view]}
                {data.latestBatch && (data.view === "reopened" || data.view === "status-changed")
                  ? ` จากรอบนำเข้า ${formatDateTime(data.latestBatch.imported_at)}`
                  : ""}
                {data.totalCount > 0
                  ? ` · แสดง ${formatNumber((data.page - 1) * data.pageSize + 1)}-${formatNumber(
                      Math.min(data.page * data.pageSize, data.totalCount)
                    )}`
                  : ""}
                {` · ${sortLabels[data.sort]}`}
              </p>
              {(data.q || data.state || data.dept || data.sort !== "updated-desc") ? (
                <Link href={buildCasesHref({ view: data.view, pageSize: data.pageSize })} className="font-semibold text-brand hover:text-brand-deep">
                  ล้างตัวกรอง
                </Link>
              ) : null}
            </div>
          </section>

          {data.items.length === 0 ? (
            <section className="rounded-2xl border border-border bg-white p-8 text-sm leading-6 text-muted">
              ไม่พบเรื่องตามเงื่อนไขที่เลือก ลองล้างตัวกรองหรือเลือกมุมมองอื่น
            </section>
          ) : (
            <>
              <section className="hidden overflow-hidden rounded-2xl border border-border bg-white lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] table-fixed border-collapse text-left text-sm">
                    <thead className="bg-surface text-xs font-semibold text-muted">
                      <tr>
                        <th className="w-[15%] border-b border-border px-4 py-3">รหัส / สถานะ</th>
                        <th className="w-[31%] border-b border-border px-4 py-3">รายละเอียดเรื่อง</th>
                        <th className="w-[20%] border-b border-border px-4 py-3">ฝ่ายรับผิดชอบ</th>
                        <th className="w-[17%] border-b border-border px-4 py-3">วันที่รับแจ้ง</th>
                        <th className="w-[17%] border-b border-border px-4 py-3">อัปเดตล่าสุด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/70">
                      {data.items.map((item) => (
                        <tr key={item.ticket_id} className="align-top hover:bg-surface/45">
                          <td className="px-4 py-4">
                            <Link href={`/cases/${encodeURIComponent(item.ticket_id)}`} className="font-mono text-xs font-semibold text-brand hover:text-brand-deep">
                              {item.ticket_id}
                            </Link>
                            <span className={`mt-2 block w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClassName(item.state)}`}>
                              {item.state || "ไม่ระบุสถานะ"}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <Link href={`/cases/${encodeURIComponent(item.ticket_id)}`} className="line-clamp-2 font-semibold leading-5 text-ink hover:text-brand">
                              {item.comment || "ไม่มีรายละเอียดปัญหา"}
                            </Link>
                            <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted">
                              {item.address || "ไม่ระบุที่อยู่"}{item.subdistrict ? `, ${item.subdistrict}` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-4 leading-5 text-ink">{formatDeptList(item.dept_list)}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-muted">{formatDateTime(item.timestamp)}</td>
                          <td className="px-4 py-4 whitespace-nowrap font-medium text-ink">{formatDateTime(item.last_activity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="space-y-3 lg:hidden">
                {data.items.map((item) => <CaseCard key={item.ticket_id} item={item} />)}
              </section>
            </>
          )}

          <div className="flex items-center justify-between" aria-label="การแบ่งหน้าทะเบียนเรื่อง">
            {data.page > 1 ? (
              <Link
                href={buildCasesHref({
                  view: data.view,
                  q: data.q,
                  state: data.state,
                  dept: data.dept,
                  sort: data.sort,
                  pageSize: data.pageSize,
                  page: data.page - 1
                })}
                className="inline-flex min-h-11 items-center rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold text-ink hover:text-brand"
              >
                ก่อนหน้า
              </Link>
            ) : (
              <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-muted opacity-60">
                ก่อนหน้า
              </span>
            )}
            <p className="text-sm text-muted" aria-live="polite">หน้า {formatNumber(data.page)}</p>
            {data.page * data.pageSize < data.totalCount ? (
              <Link
                href={buildCasesHref({
                  view: data.view,
                  q: data.q,
                  state: data.state,
                  dept: data.dept,
                  sort: data.sort,
                  pageSize: data.pageSize,
                  page: data.page + 1
                })}
                className="inline-flex min-h-11 items-center rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold text-ink hover:text-brand"
              >
                ถัดไป
              </Link>
            ) : (
              <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-muted opacity-60">
                ถัดไป
              </span>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
