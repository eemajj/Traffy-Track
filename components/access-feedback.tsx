"use client";

import { useSearchParams } from "next/navigation";

export function AccessFeedback() {
  const searchParams = useSearchParams();
  if (searchParams.get("access") !== "denied") return null;

  return (
    <p role="status" className="mb-4 rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
      Passcode นี้ไม่มีสิทธิ์เปิดหน้าที่ร้องขอ ระบบจึงพากลับมายังหน้าที่ได้รับอนุญาต
    </p>
  );
}
