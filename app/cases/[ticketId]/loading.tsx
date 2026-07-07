import { PageSkeleton } from "@/components/page-skeleton";

export default function CaseDetailLoading() {
  return (
    <PageSkeleton
      title="รายละเอียดเรื่อง"
      description="กำลังโหลดข้อมูลเรื่องและประวัติการเปลี่ยนแปลง"
      variant="detail"
    />
  );
}
