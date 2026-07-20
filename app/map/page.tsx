import { AppShell } from "@/components/app-shell";
import { ComplaintMapLoader } from "@/components/complaint-map-loader";
import { MapFilters } from "@/components/map-filters";
import { getComplaintMapData, MapFocus } from "@/lib/map";

export const dynamic = "force-dynamic";

type MapPageProps = {
  searchParams?: Promise<{
    view?: string;
    q?: string;
    state?: string;
    dept?: string;
    focusLat?: string;
    focusLng?: string;
    focusRadius?: string;
    period?: string;
  }>;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("th-TH").format(value);
}

function buildMapHref(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  return search.size > 0 ? `/map?${search}` : "/map";
}

function getMapFocus(searchParams: Awaited<NonNullable<MapPageProps["searchParams"]>>): MapFocus | null {
  if (!searchParams.focusLat?.trim() || !searchParams.focusLng?.trim() || !searchParams.period?.trim()) {
    return null;
  }

  const lat = Number(searchParams.focusLat);
  const lng = Number(searchParams.focusLng);
  const radiusMeters = Number(searchParams.focusRadius || 500);
  const periodDays = Number(searchParams.period);

  if (
    !Number.isFinite(lat)
    || !Number.isFinite(lng)
    || !Number.isFinite(radiusMeters)
    || lat < -90
    || lat > 90
    || lng < -180
    || lng > 180
    || radiusMeters < 100
    || radiusMeters > 2000
    || ![30, 90, 180].includes(periodDays)
  ) {
    return null;
  }

  return { lat, lng, radiusMeters, periodDays: periodDays as MapFocus["periodDays"] };
}

export default async function MapPage(props: MapPageProps) {
  const searchParams = (await props.searchParams) ?? {};
  const focus = getMapFocus(searchParams);
  const data = await getComplaintMapData(searchParams, focus);
  const preservedParams: Record<string, string> = focus ? {
    focusLat: String(focus.lat),
    focusLng: String(focus.lng),
    focusRadius: String(focus.radiusMeters),
    period: String(focus.periodDays)
  } : {};

  return (
    <AppShell title="แผนที่จุดร้องเรียน" description="ดูการกระจายตัวของเรื่องร้องเรียนบนแผนที่ และเปิดรายละเอียดเคสจากจุดที่สนใจ">
      {data.status === "missing_env" ? (
        <section className="rounded-2xl border border-warning/20 bg-warning/10 p-6">
          <h2 className="text-xl font-bold text-warning">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-warning">ต้องตั้งค่า Supabase admin env ก่อนจึงจะดูแผนที่จุดร้องเรียนได้</p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-2xl border border-danger/20 bg-danger/5 p-6">
          <h2 className="text-xl font-bold text-danger">โหลดแผนที่ไม่ได้ชั่วคราว</h2>
          <p className="mt-3 text-sm leading-6 text-danger">{data.message}</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-border bg-white">
          <header className="border-b border-border px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold text-ink">พื้นที่ปฏิบัติงานบนแผนที่</h2>
                <p className="mt-1 text-sm leading-6 text-muted">กรองพื้นที่ เลือกหมุด และเปิดเคสได้จาก workspace เดียว</p>
              </div>
              <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <div className="flex items-baseline gap-1.5"><dt className="text-muted">พบทั้งหมด</dt><dd className="font-semibold text-ink">{formatNumber(data.totalMatchingCount)}</dd></div>
                <div className="flex items-baseline gap-1.5"><dt className="text-muted">มีพิกัด</dt><dd className="font-semibold text-brand">{formatNumber(data.points.length)}</dd></div>
                {data.missingCoordinateCount > 0 ? <div className="flex items-baseline gap-1.5"><dt className="text-muted">ไม่มีพิกัด</dt><dd className="font-semibold text-warning">{formatNumber(data.missingCoordinateCount)}</dd></div> : null}
              </dl>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border/70 pt-3 text-xs font-medium text-muted" aria-label="คำอธิบายสีหมุด">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-warning" aria-hidden="true" />คงค้าง</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-success" aria-hidden="true" />ปิดแล้ว</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-muted" aria-hidden="true" />ไม่ระบุสถานะ</span>
              {data.capped ? <span className="font-semibold text-warning">แสดงสูงสุด 10,000 จุด</span> : null}
            </div>
          </header>

          <div className="border-b border-border bg-surface/55 px-4 py-4 sm:px-6">
            <MapFilters
              view={data.view}
              q={data.q}
              state={data.state}
              dept={data.dept}
              stateOptions={data.stateOptions}
              departmentOptions={data.departmentOptions}
              preservedParams={preservedParams}
            />
            {focus ? (
              <p className="mt-3 rounded-xl border border-brand/15 bg-white px-4 py-3 text-sm font-medium text-brand">
                แสดงเรื่องที่รับเข้าในช่วง {formatNumber(focus.periodDays)} วัน ภายในวงรัศมี {formatNumber(focus.radiusMeters)} เมตรเดียวกับหน้า Analytics
              </p>
            ) : null}
          </div>

          {data.points.length > 0 ? (
            <ComplaintMapLoader
              points={data.points}
              focus={focus}
              returnTo={buildMapHref({
                view: data.view,
                q: data.q,
                state: data.state,
                dept: data.dept,
                ...preservedParams
              })}
            />
          ) : (
            <div className="px-5 py-14 text-center sm:px-8">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-xl text-brand" aria-hidden="true">⌖</div>
              <h2 className="mt-4 text-lg font-semibold text-ink">ไม่พบเคสที่มีพิกัดตามตัวกรองนี้</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">ลองเปลี่ยนมุมมองหรือล้างตัวกรอง หากข้อมูลต้นทางไม่มี latitude และ longitude เคสจะไม่แสดงบนแผนที่</p>
            </div>
          )}
        </section>
      )}
    </AppShell>
  );
}
