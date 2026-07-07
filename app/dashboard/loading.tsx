import { PageSkeleton } from "@/components/page-skeleton";

export default function DashboardLoading() {
  return (
    <PageSkeleton
      title="ภาพรวมระบบ"
      description="กำลังโหลดสรุปเรื่องคงค้าง เรื่องรอจัดฝ่ายรับผิดชอบ และรายการเปลี่ยนแปลงสำคัญ"
      variant="dashboard"
    />
  );
}
