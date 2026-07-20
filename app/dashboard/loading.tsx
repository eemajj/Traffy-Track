import { PageSkeleton } from "@/components/page-skeleton";

export default function DashboardLoading() {
  return (
    <PageSkeleton
      title="ภาพรวมระบบ"
      description="กำลังโหลดสถิติตามช่วงวันที่ เรื่องคงค้าง และรายการที่ต้องดำเนินการ"
      variant="traffy-dashboard"
    />
  );
}
