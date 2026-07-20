import { AnalyticsContent } from "@/app/analytics/analytics-sections";
import { AppShell } from "@/components/app-shell";
import { getAnalyticsData, getAnalyticsPeriodDays } from "@/lib/analytics";

export const dynamic = "force-dynamic";

type AnalyticsPageProps = {
  searchParams?: Promise<{ period?: string | string[] }>;
};

export default async function AnalyticsPage(props: AnalyticsPageProps) {
  const searchParams = (await props.searchParams) ?? {};
  const data = await getAnalyticsData(getAnalyticsPeriodDays(searchParams.period));

  return (
    <AppShell title="วิเคราะห์แนวโน้ม" description="ติดตามภาระงานตามช่วงเวลา จุดที่รับเรื่องหนาแน่น อายุเรื่องคงค้าง และเวลาปิดเรื่องจากข้อมูลที่ระบบตรวจพบจริง">
      {data.status === "missing_env" ? (
        <section className="rounded-2xl border border-warning/20 bg-warning/10 p-6">
          <h2 className="text-xl font-semibold text-warning">Supabase ยังไม่ถูกตั้งค่า</h2>
          <p className="mt-3 text-sm leading-6 text-warning">ต้องตั้งค่า Supabase admin env ก่อนจึงจะดูข้อมูลวิเคราะห์ได้</p>
        </section>
      ) : data.status === "unavailable" ? (
        <section className="rounded-2xl border border-danger/20 bg-danger/5 p-6">
          <h2 className="text-xl font-semibold text-danger">โหลดข้อมูลวิเคราะห์ไม่ได้ชั่วคราว</h2>
          <p className="mt-3 text-sm leading-6 text-danger">{data.message}</p>
          <p className="mt-2 text-xs leading-5 text-muted">หากเพิ่งอัปเดตโค้ด ให้ตรวจว่า migration analytics ถูก apply ใน Supabase แล้ว</p>
        </section>
      ) : <AnalyticsContent data={data} />}
    </AppShell>
  );
}
