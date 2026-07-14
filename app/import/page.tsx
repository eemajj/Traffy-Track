import { AppShell } from "@/components/app-shell";
import { ImportClient } from "@/app/import/import-client";
import { getRecentImportJobs } from "@/lib/import/process";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const recentJobs = await getRecentImportJobs(8).catch((error) => {
    console.error("Load recent import jobs failed", error);
    return [];
  });

  return (
    <AppShell
      title="นำเข้าข้อมูล"
      description="อัปโหลดไฟล์ CSV จาก CityData เพื่อตรวจรายการเปลี่ยนแปลง อัปเดตข้อมูลเรื่องล่าสุด และบันทึกสรุปรอบการนำเข้า"
    >
      <ImportClient initialJobs={recentJobs} />
    </AppShell>
  );
}
