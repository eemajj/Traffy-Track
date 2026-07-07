"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env, requireAppPasscode } from "@/lib/env";
import { createSessionCookieValue, SESSION_MAX_AGE_SECONDS } from "@/lib/session";

type LoginState = {
  error?: string;
};

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const configuredPasscode = requireAppPasscode();
  const passcode = String(formData.get("passcode") || "");
  const nextPath = String(formData.get("next") || "/dashboard");

  if (passcode !== configuredPasscode) {
    return { error: "รหัสผ่านไม่ถูกต้อง" };
  }

  const sessionCookieValue = await createSessionCookieValue();

  cookies().set(env.authCookieName, sessionCookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });

  redirect(nextPath.startsWith("/") ? nextPath : "/dashboard");
}
