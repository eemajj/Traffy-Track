import { cookies } from "next/headers";

import { env } from "@/lib/env";
import { verifySessionCookieValue } from "@/lib/session";

export async function hasValidSessionCookie() {
  if (!env.appPasscode) {
    return false;
  }

  const cookieStore = cookies();
  return verifySessionCookieValue(cookieStore.get(env.authCookieName)?.value);
}

export function getLoginRedirectPath(nextPath?: string) {
  if (!nextPath || nextPath === "/login") {
    return "/login";
  }
  return `/login?next=${encodeURIComponent(nextPath)}`;
}
