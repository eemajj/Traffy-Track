"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env, requireAppPasscode } from "@/lib/env";
import { getSafeNextPath } from "@/lib/auth";
import { createSessionCookieValue, SESSION_MAX_AGE_SECONDS } from "@/lib/session";

type LoginState = {
  error?: string;
};

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const configuredPasscode = requireAppPasscode();
  const passcode = String(formData.get("passcode") || "");
  const nextPath = getSafeNextPath(formData.get("next"));
  const role = env.appAdminPasscode && passcode === env.appAdminPasscode
    ? "admin"
    : passcode === configuredPasscode
      ? env.appAdminPasscode
        ? "operator"
        : "admin"
      : null;

  if (!role) {
    return { error: "รหัสผ่านไม่ถูกต้อง" };
  }

  const sessionCookieValue = await createSessionCookieValue(role);

  const cookieStore = await cookies();
  cookieStore.set(env.authCookieName, sessionCookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });

  redirect(nextPath);
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.set(env.authCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  redirect("/login");
}
