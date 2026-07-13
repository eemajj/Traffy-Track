import { PageSkeleton } from "@/components/page-skeleton";

export default function AnalyticsLoading() {
  return (
    <PageSkeleton
      title="วิเคราะห์แนวโน้ม"
      description="กำลังสรุปแนวโน้ม พื้นที่หนาแน่น อายุเรื่องคงค้าง และเวลาปิดเรื่อง"
      variant="dashboard"
    />
  );
}
