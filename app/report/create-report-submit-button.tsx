"use client";

import { useFormStatus } from "react-dom";

export function CreateReportSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-2xl bg-brand px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-brand-deep hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "กำลังสร้างรายงาน..." : "สร้างรายงานรอบใหม่"}
    </button>
  );
}
