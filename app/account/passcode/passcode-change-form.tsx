"use client";

import { useActionState } from "react";

import { changeOwnPasscodeAction } from "@/app/account/passcode/actions";

export function PasscodeChangeForm() {
  const [state, action, pending] = useActionState(changeOwnPasscodeAction, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block text-sm font-semibold text-ink">Passcode ใหม่<input name="passcode" type="password" required minLength={6} maxLength={128} autoComplete="new-password" className="mt-2 min-h-12 w-full rounded-2xl border border-border bg-white px-4 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" /></label>
      <label className="block text-sm font-semibold text-ink">ยืนยัน Passcode ใหม่<input name="confirmation" type="password" required minLength={6} maxLength={128} autoComplete="new-password" className="mt-2 min-h-12 w-full rounded-2xl border border-border bg-white px-4 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand/10" /></label>
      {state.error ? <p role="alert" className="rounded-2xl bg-danger/5 px-4 py-3 text-sm text-danger">{state.error}</p> : null}
      <button disabled={pending} className="min-h-12 w-full rounded-2xl bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-deep disabled:opacity-60">{pending ? "กำลังเปลี่ยน Passcode..." : "เปลี่ยน Passcode และเข้าสู่ระบบใหม่"}</button>
    </form>
  );
}
