"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route rendering failed", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <section className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-panel sm:p-8" role="alert">
        <p className="text-sm font-semibold text-danger">โหลดข้อมูลไม่สำเร็จ</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-ink">ระบบตอบสนองช้าหรือขัดข้องชั่วคราว</h1>
        <p className="mt-3 max-w-prose text-sm leading-6 text-muted">
          ข้อมูลของคุณยังไม่สูญหาย ลองโหลดส่วนนี้อีกครั้ง หากยังพบปัญหาให้รอสักครู่แล้วกลับมาใหม่
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-deep focus:outline-none focus:ring-4 focus:ring-ring"
        >
          ลองโหลดอีกครั้ง
        </button>
      </section>
    </main>
  );
}
