"use server";

import { createHmac } from "node:crypto";

import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { consumeLoginRateLimit, recordAuditEvent } from "@/lib/audit";
import { ACCESS_PRESETS, getFirstAllowedPath, getRoutePermission, hasPermission } from "@/lib/access-permissions";
import { env } from "@/lib/env";
import { getSafeNextPath } from "@/lib/auth";
import { findPasscodeProfile, getLegacyPasscodeAccess, hasActivePasscodeProfile } from "@/lib/passcode-profiles";
import {
  createIdentitySessionCookieValue,
  createSessionCookieValue,
  SESSION_MAX_AGE_SECONDS,
  type SessionClaims
} from "@/lib/session";

type LoginState = {
  error?: string;
};

async function getLoginIdentifierHash(secret: string) {
  const requestHeaders = await headers();
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  const address = realIp || (forwardedFor && forwardedFor[0]) || "unknown";
  return createHmac("sha256", secret).update(address).digest("hex");
}

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const passcode = String(formData.get("passcode") || "");
  const requestedNextPath = getSafeNextPath(formData.get("next"));
  const loginSecret = process.env.APP_SESSION_SECRET || env.appPasscode;
  if (!loginSecret) return { error: "ระบบยืนยันตัวตนยังไม่ถูกตั้งค่า" };

  let profile;
  try {
    profile = await findPasscodeProfile(passcode);
  } catch {
    return { error: "ระบบตรวจสอบ Passcode ไม่พร้อมใช้งาน กรุณาลองใหม่" };
  }
  const legacyAccess = profile ? null : getLegacyPasscodeAccess(passcode);
  const role = profile ? (profile.isAdmin ? "admin" : "operator") : legacyAccess?.role || null;

  const identifierHash = await getLoginIdentifierHash(loginSecret);
  const rateLimit = await consumeLoginRateLimit({
    identifierHash,
    succeeded: Boolean(role)
  });

  if (!rateLimit.allowed) {
    await recordAuditEvent({
      action: "auth.login_rate_limited",
      resourceType: "session",
      outcome: "failure",
      actorRole: "system",
      metadata: { retryAfterSeconds: rateLimit.retryAfterSeconds, identifierPrefix: identifierHash.slice(0, 12) }
    });
    return { error: "เข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่" };
  }

  // Sunset gate: environment passcodes work only until the first DB profile
  // exists. Runs after rate-limit consumption so attempts are still throttled.
  if (!profile && role && await hasActivePasscodeProfile()) {
    await recordAuditEvent({
      action: "auth.login_legacy_passcode_blocked",
      resourceType: "session",
      outcome: "failure",
      actorRole: "system",
      metadata: { identifierPrefix: identifierHash.slice(0, 12) }
    });
    return { error: "รหัสผ่าน Environment ถูกปิดใช้งานแล้ว กรุณาใช้ Passcode ส่วนบุคคลของท่าน" };
  }

  if (!role) {
    await recordAuditEvent({
      action: "auth.login_failed",
      resourceType: "session",
      outcome: "failure",
      actorRole: "system",
      metadata: { identifierPrefix: identifierHash.slice(0, 12) }
    });
    return { error: "รหัสผ่านไม่ถูกต้อง" };
  }

  const sessionCookieValue = profile
    ? await createIdentitySessionCookieValue({
        identityId: profile.id,
        displayName: profile.displayName,
        position: profile.position,
        roleLabel: profile.roleLabel,
        permissions: profile.permissions,
        isAdmin: profile.isAdmin,
        accessVersion: profile.accessVersion,
        mustRotate: profile.mustRotate
      })
    : await createSessionCookieValue(role);

  const accessClaims = profile
    ? ({
        role,
        permissions: profile.permissions
      } as Pick<SessionClaims, "role" | "permissions">)
    : ({
        role,
        permissions: role === "admin" ? ACCESS_PRESETS.admin.permissions : ACCESS_PRESETS.operator.permissions
      } as const);
  const requestedPermission = getRoutePermission(requestedNextPath);
  const nextPath = profile?.mustRotate
    ? "/account/passcode"
    : requestedPermission && !hasPermission(accessClaims, requestedPermission)
    ? getFirstAllowedPath(accessClaims)
    : requestedNextPath;

  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const isHttps = forwardedProto === "https";

  const cookieStore = await cookies();
  cookieStore.set(env.authCookieName, sessionCookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });

  await recordAuditEvent({
    action: "auth.login_succeeded",
    resourceType: "session",
    actorRole: role,
    resourceId: profile?.id,
    metadata: {
      identifierPrefix: identifierHash.slice(0, 12),
      profileId: profile?.id || null,
      displayName: profile?.displayName || legacyAccess?.label || null
    }
  });

  redirect(nextPath);
}

export async function logoutAction() {
  const requestHeaders = await headers();
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const isHttps = forwardedProto === "https";

  const cookieStore = await cookies();
  cookieStore.set(env.authCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 0
  });

  redirect("/login");
}
