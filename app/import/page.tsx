import { AppShell } from "@/components/app-shell";
import { ImportClient } from "@/app/import/import-client";

export default function ImportPage() {
  return (
    <AppShell
      title="นำเข้าข้อมูล"
      description="อัปโหลดไฟล์ CSV จาก CityData เพื่อตรวจรายการเปลี่ยนแปลง อัปเดตข้อมูลเรื่องล่าสุด และบันทึกสรุปรอบการนำเข้า"
    >
      <ImportClient />
    </AppShell>
  );
}
