import { PageSkeleton } from "@/components/page-skeleton";

export default function AdminLoading() {
  return (
    <PageSkeleton
      title="ผู้ดูแลระบบ"
      description="กำลังโหลดสุขภาพระบบ ฐานข้อมูล Storage และสถานะงานนำเข้า"
      variant="detail"
    />
  );
}
