import { redirect } from "next/navigation";

import { PasscodeChangeForm } from "@/app/account/passcode/passcode-change-form";
import { getCurrentSessionClaims } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ChangePasscodePage() {
  const session = await getCurrentSessionClaims();
  if (!session) redirect("/login?next=/account/passcode");
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-panel sm:p-8">
        <p className="text-sm font-semibold text-brand">ความปลอดภัยของ Passcode</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">เปลี่ยน Passcode ก่อนใช้งานต่อ</h1>
        <p className="mt-3 text-sm leading-6 text-muted">{session.displayName} · ใช้รหัสอย่างน้อย 6 ตัวอักษรและหลีกเลี่ยงรหัสที่คาดเดาง่าย หลังบันทึกระบบจะยกเลิก session เดิมทันที</p>
        <PasscodeChangeForm />
      </section>
    </main>
  );
}
