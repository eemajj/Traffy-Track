import { PageSkeleton } from "@/components/page-skeleton";

export default function CasesLoading() {
  return (
    <PageSkeleton
      title="ทะเบียนเรื่อง"
      description="กำลังโหลดรายการเรื่องและตัวกรอง"
      variant="list"
    />
  );
}
