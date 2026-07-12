import nextDynamic from "next/dynamic";

import { AppShell } from "@/components/app-shell";
import { MapFilters } from "@/components/map-filters";
import { getComplaintMapData } from "@/lib/map";

export const dynamic = "force-dynamic";

const ComplaintMap = nextDynamic(() => import("@/components/complaint-map").then((module) => module.ComplaintMap), {
  ssr: false,
  loading: () => <div className="flex min-h-[30rem] items-center justify-center bg-surface text-sm text-muted">กำลังเตรียมแผนที่…</div>
});

type MapPageProps = {
  searchParams?: {
    view?: string;
    q?: string;
    state?: string;
    dept?: string;
  };
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

export default async function MapPage({ searchParams = {} }: MapPageProps) {
  const data = await getComplaintMapData(searchParams);

  return (
    <AppShell title="แผนที่จุดร้องเรียน" description="ดูการกระจายตัวของเรื่องร้องเรียนบนแผนที่ และเปิดรายละเอียดเคสจากจุดที่สนใจ">
      {data.status === "missing_env" ? (
        <section className="rounded-3xl border border-warning/20 bg-warning/10 p-6">
          <h2 className="text-xl font-bold text-warning">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-warning">ต้องตั้งค่า Supabase admin env ก่อนจึงจะดูแผนที่จุดร้องเรียนได้</p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-3xl border border-danger/20 bg-danger/5 p-6">
          <h2 className="text-xl font-bold text-danger">โหลดแผนที่ไม่ได้ชั่วคราว</h2>
          <p className="mt-3 text-sm leading-6 text-danger">{data.message}</p>
        </section>
      ) : (
        <div className="space-y-6">
          <section className="rounded-3xl border border-border/80 bg-white p-5 shadow-panel">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-ink">มองภาพรวมตามพื้นที่</h2>
                <p className="mt-1 text-sm leading-6 text-muted">จุดสีส้มคือเรื่องที่ยังต้องติดตาม จุดสีเขียวคือเรื่องที่ปิดแล้ว</p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="inline-flex items-center gap-2 rounded-full bg-warning/10 px-3 py-2 font-semibold text-warning">
                  <span className="h-2.5 w-2.5 rounded-full bg-warning" aria-hidden="true" />
                  คงค้าง
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-2 font-semibold text-success">
                  <span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden="true" />
                  ปิดแล้ว
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-2 font-semibold text-muted">
                  <span className="h-2.5 w-2.5 rounded-full bg-muted" aria-hidden="true" />
                  ไม่ระบุสถานะ
                </span>
              </div>
            </div>

            <MapFilters
              view={data.view}
              q={data.q}
              state={data.state}
              dept={data.dept}
              stateOptions={data.stateOptions}
              departmentOptions={data.departmentOptions}
            />

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <span>พบ {formatNumber(data.totalMatchingCount)} เรื่อง</span>
              <span>แสดงบนแผนที่ {formatNumber(data.points.length)} จุด</span>
              {data.missingCoordinateCount > 0 ? <span className="font-semibold text-warning">ไม่มีพิกัด {formatNumber(data.missingCoordinateCount)} เรื่อง</span> : null}
              {data.capped ? <span className="font-semibold text-warning">แสดงผลสูงสุด 10,000 จุด</span> : null}
            </div>
          </section>

          {data.points.length > 0 ? (
            <ComplaintMap points={data.points} />
          ) : (
            <section className="rounded-3xl border border-border bg-white p-10 text-center shadow-panel">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-2xl" aria-hidden="true">⌖</div>
              <h2 className="mt-4 text-xl font-semibold text-ink">ยังไม่มีจุดที่แสดงบนแผนที่</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">ลองเปลี่ยนตัวกรอง หรือ import ข้อมูลที่มีพิกัด latitude และ longitude</p>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
