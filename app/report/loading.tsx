import { PageSkeleton } from "@/components/page-skeleton";

export default function ReportLoading() {
  return (
    <PageSkeleton
      title="รอบรายงาน"
      description="กำลังโหลดคลังรอบรายงานและสถานะหลักฐาน"
      variant="list"
    />
  );
}
