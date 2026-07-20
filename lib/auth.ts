import { cookies } from "next/headers";

import { hasPermission, type AppPermission } from "@/lib/access-permissions";
import { env } from "@/lib/env";
import { validatePasscodeProfileSession } from "@/lib/passcode-profiles";
import { getSessionClaims, SessionRole } from "@/lib/session";

const DEFAULT_AUTHENTICATED_PATH = "/dashboard";
const SAFE_REDIRECT_ORIGIN = "https://app.invalid";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;

function isSameOriginRelativePath(value: string) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return false;
  }

  try {
    return new URL(value, SAFE_REDIRECT_ORIGIN).origin === SAFE_REDIRECT_ORIGIN;
  } catch {
    return false;
  }
}

export function getSafeNextPath(value: unknown, fallback = DEFAULT_AUTHENTICATED_PATH) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return fallback;
  }

  let decodedValue = value;

  for (let depth = 0; depth < 6; depth += 1) {
    if (!isSameOriginRelativePath(decodedValue)) {
      return fallback;
    }

    let nextDecodedValue: string;

    try {
      nextDecodedValue = decodeURIComponent(decodedValue);
    } catch {
      return fallback;
    }

    if (nextDecodedValue === decodedValue) {
      return value;
    }

    decodedValue = nextDecodedValue;
  }

  return fallback;
}

export async function hasValidSessionCookie() {
  if (!env.appPasscode) {
    // Database-backed Passcode profiles do not require the legacy APP_PASSCODE.
    if (!env.supabaseServiceRoleKey) return false;
  }

  return Boolean(await getCurrentSessionClaims());
}

export async function getCurrentSessionClaims() {
  const cookieStore = await cookies();
  const claims = await getSessionClaims(cookieStore.get(env.authCookieName)?.value);
  if (!claims || !claims.identityId || claims.accessVersion === null) return claims;

  const profile = await validatePasscodeProfileSession({
    identityId: claims.identityId,
    accessVersion: claims.accessVersion
  });
  if (!profile) return null;

  return {
    ...claims,
    role: profile.isAdmin ? ("admin" as const) : ("operator" as const),
    displayName: profile.displayName,
    position: profile.position,
    roleLabel: profile.roleLabel,
    permissions: profile.permissions,
    mustRotate: profile.mustRotate
  };
}

export async function hasSessionRole(role: SessionRole) {
  const claims = await getCurrentSessionClaims();
  return claims?.role === role;
}

export async function hasSessionPermission(permission: AppPermission) {
  return hasPermission(await getCurrentSessionClaims(), permission);
}

export function getLoginRedirectPath(nextPath?: string) {
  if (!nextPath || nextPath === "/login") {
    return "/login";
  }

  return `/login?next=${encodeURIComponent(getSafeNextPath(nextPath))}`;
}
