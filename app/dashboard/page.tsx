import { TraffyStatistics } from "@/app/dashboard/traffy-statistics";
import { AppShell } from "@/components/app-shell";
import { WorkflowActionCenter } from "@/components/workflow-action-center";
import { getDashboardData } from "@/lib/dashboard";
import { normalizeDashboardDateRange } from "@/lib/dashboard/statistics";
import { getDashboardStatistics } from "@/lib/dashboard/statistics-query";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<{
    from?: string | string[];
    to?: string | string[];
    scope?: string | string[];
    dept?: string | string[];
  }>;
};

export default async function DashboardPage(props: DashboardPageProps) {
  const searchParams = (await props.searchParams) || {};
  const range = normalizeDashboardDateRange(searchParams);
  const selectedDept = Array.isArray(searchParams.dept) ? searchParams.dept[0] : searchParams.dept;

  const [data, statistics] = await Promise.all([
    getDashboardData("district"),
    getDashboardStatistics(range, "district", selectedDept)
  ]);

  return (
    <AppShell
      title="ภาพรวมผลงานและการติดตามงาน เขตทวีวัฒนา"
      description="ศูนย์ข้อมูลการบริหารจัดการและการติดตามงานคงค้าง สำนักงานเขตทวีวัฒนา"
    >
      <div className="space-y-8">
        <TraffyStatistics
          data={statistics}
          dashboardData={data}
          selectedDept={selectedDept}
        />
        {data.status === "ready" ? (
          <WorkflowActionCenter items={data.actionCenter} />
        ) : null}
      </div>
    </AppShell>
  );
}

export const metadata = {
  title: "ภาพรวมระบบ — ระบบติดตามเรื่องร้องเรียน เขตทวีวัฒนา",
};
