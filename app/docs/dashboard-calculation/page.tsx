import Link from "next/link";

import { AppShell } from "@/components/app-shell";

const formulas = [
  ["เปอร์เซ็นต์สถานะ", "จำนวนสถานะ ÷ เรื่องทั้งหมดในช่วง × 100"],
  ["พ้นรอรับเรื่อง", "เรื่องทั้งหมด − รอรับเรื่อง"],
  ["กำลังดำเนินการรวม", "รับเรื่อง + ดำเนินการ + ศึกษา + นโยบาย + งบ + จัดซื้อ + กฎหมาย"],
  ["ไม่เกี่ยวข้องรวม", "ไม่เกี่ยวข้อง + ติดตามเรื่อง"],
  ["เสร็จสิ้นที่ได้ 1–2 ดาว", "จำนวนเรื่องสถานะเสร็จสิ้นที่มี star เป็น 1 หรือ 2; เป็น feedback คะแนนต่ำ ไม่ใช่การรับรอง"]
] as const;

export default function DashboardCalculationPage() {
  return (
    <AppShell title="สูตรคำนวณ Dashboard" description="นิยามตัวเลข ขอบเขตช่วงวันที่ และระดับความน่าเชื่อถือจากการแกะ Dashboard ของ Traffy Fondue">
      <div className="space-y-6">
        <section className="rounded-2xl border border-brand/20 bg-surface p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-ink">ขอบเขตที่ระบบใช้ร่วมกัน</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">Dashboard และรายงานสรุปเลือกเรื่องจากวันที่รับแจ้งตามเวลา Asia/Bangkok แล้วแสดงสถานะล่าสุด ณ เวลาที่เรียกดู จึงเป็น live cohort ไม่ใช่สถานะย้อนหลัง ณ วันสิ้นสุด</p>
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-white">
          <div className="border-b border-border px-5 py-4 sm:px-6"><h2 className="text-xl font-semibold text-ink">สูตรที่ใช้งาน</h2></div>
          <dl className="divide-y divide-border">
            {formulas.map(([label, formula]) => <div key={label} className="grid gap-2 px-5 py-4 sm:grid-cols-[13rem_1fr] sm:px-6"><dt className="font-semibold text-ink">{label}</dt><dd className="font-mono text-sm leading-6 text-muted">{formula}</dd></div>)}
          </dl>
        </section>

        <section className="rounded-2xl border border-warning/20 bg-warning/5 p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-warning">สิ่งที่ยังคำนวณตรงไม่ได้</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-muted">
            <li>“จัดการเอง” ต้องใช้หน่วยงานผู้ปิดเรื่อง ซึ่งไม่มีใน CSV</li>
            <li>ช่วงเวลา 4–98 วันไม่มี completion timestamp และวิธี aggregate จากต้นทาง</li>
            <li>การรับรองการแก้ไขยังคำนวณไม่ได้ เพราะ CSV ไม่มี confirmed flag; จำนวน 808 ที่นับได้จากเรื่องเสร็จสิ้นซึ่งมี 1–2 ดาวต้องแสดงเป็น feedback คะแนนต่ำเท่านั้น</li>
          </ul>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-deep focus:outline-none focus:ring-4 focus:ring-[var(--ring)]">กลับไป Dashboard</Link>
          <Link href="/report" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-white px-5 py-2 text-sm font-semibold text-ink hover:border-brand/40 focus:outline-none focus:ring-4 focus:ring-[var(--ring)]">ไปหน้ารายงาน</Link>
        </div>
      </div>
    </AppShell>
  );
}
