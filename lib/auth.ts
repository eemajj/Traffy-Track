import { cookies } from "next/headers";

import { env } from "@/lib/env";
import { getSessionClaims, SessionRole, verifySessionCookieValue } from "@/lib/session";

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
    return false;
  }

  const cookieStore = cookies();
  return verifySessionCookieValue(cookieStore.get(env.authCookieName)?.value);
}

export async function getCurrentSessionClaims() {
  if (!env.appPasscode) {
    return null;
  }

  const cookieStore = cookies();
  return getSessionClaims(cookieStore.get(env.authCookieName)?.value);
}

export async function hasSessionRole(role: SessionRole) {
  const claims = await getCurrentSessionClaims();
  return claims?.role === role;
}

export function getLoginRedirectPath(nextPath?: string) {
  if (!nextPath || nextPath === "/login") {
    return "/login";
  }

  return `/login?next=${encodeURIComponent(getSafeNextPath(nextPath))}`;
}
