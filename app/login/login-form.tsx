"use client";

import { useFormState, useFormStatus } from "react-dom";

import { loginAction } from "@/app/login/actions";

type LoginFormProps = {
  nextPath: string;
};

type LoginFormState = {
  error?: string;
};

const initialState: LoginFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-ink disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
    </button>
  );
}

export function LoginForm({ nextPath }: LoginFormProps) {
  const [state, formAction] = useFormState<LoginFormState, FormData>(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={nextPath} />
      <div className="space-y-2">
        <label htmlFor="passcode" className="text-sm font-semibold text-slate-700">
          รหัสผ่าน
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          required
          autoFocus
          className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-ink outline-none transition focus:border-brand focus:bg-white focus:shadow-[0_0_0_4px_var(--ring)]"
          placeholder="กรอกรหัสผ่าน"
        />
      </div>
      {state.error ? (
        <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <SubmitButton />
    </form>
  );
}
