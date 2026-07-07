import { PageSkeleton } from "@/components/page-skeleton";

export default function ReportDetailLoading() {
  return (
    <PageSkeleton
      title="รอบรายงาน"
      description="กำลังโหลดรายการตรวจรายฝ่ายและรายการเรื่องในรอบ"
      variant="detail"
    />
  );
}
