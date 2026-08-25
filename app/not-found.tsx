import Link from "next/link";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "ไม่พบหน้าที่ต้องการ — ระบบติดตามเรื่องร้องเรียน เขตทวีวัฒนา",
  description: "ไม่พบหน้าที่คุณกำลังเรียกหาในระบบติดตามเรื่องร้องเรียน"
};

export default function NotFound() {
  return (
    <AppShell
      title="ไม่พบหน้าที่ต้องการ (404)"
      description="ระบบติดตามเรื่องร้องเรียน สำนักงานเขตทวีวัฒนา"
    >
      <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-2xl border border-border bg-white p-8 text-center shadow-xs">
        <span className="text-4xl" aria-hidden="true">🔍</span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink">
          ไม่พบหน้าที่คุณต้องการ
        </h2>
        <p className="mt-2 max-w-md text-sm text-muted">
          หน้าที่คุณกำลังเปิดอาจถูกย้าย ลบ หรือคุณอาจพิมพ์ที่อยู่ URL ไม่ถูกต้อง
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-brand-deep transition"
          >
            🏠 กลับหน้าภาพรวมระบบ
          </Link>
          <Link
            href="/cases"
            className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-ink hover:bg-white transition"
          >
            📋 ไปที่ทะเบียนเรื่อง
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
