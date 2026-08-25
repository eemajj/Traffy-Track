import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getFirstAllowedPath, getRoutePermission, hasPermission } from "@/lib/access-permissions";
import { getSessionClaims } from "@/lib/session";

const authCookieName = process.env.APP_AUTH_COOKIE || "citydata-passcode";

const protectedPrefixes = ["/import", "/dashboard", "/analytics", "/cases", "/map", "/report", "/admin", "/account"];
const maintenanceWriteExemptions = ["/api/admin/maintenance", "/api/admin/backup/export", "/api/cron/"];

const MAINTENANCE_FLAG_TTL_MS = 60_000;
// Module-level cache so a transient Supabase outage does not silently reopen writes
// while an administrator believes maintenance mode is still active.
let maintenanceFlagCache: { value: boolean; fetchedAt: number } | null = null;

async function isMaintenanceEnabled() {
  if (maintenanceFlagCache && Date.now() - maintenanceFlagCache.fetchedAt < MAINTENANCE_FLAG_TTL_MS) {
    return maintenanceFlagCache.value;
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return false;
  try {
    const url = new URL("/rest/v1/system_settings", supabaseUrl);
    url.searchParams.set("singleton", "eq.true");
    url.searchParams.set("select", "maintenance_enabled");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`system_settings responded ${response.status}`);
    const rows = await response.json() as Array<{ maintenance_enabled?: boolean }>;
    const value = rows[0]?.maintenance_enabled === true;
    maintenanceFlagCache = { value, fetchedAt: Date.now() };
    return value;
  } catch (error) {
    // Stale-while-error: keep enforcing the last known flag instead of failing open.
    if (maintenanceFlagCache) {
      console.error("maintenance_flag_check_failed_using_stale_value", {
        staleAgeMs: Date.now() - maintenanceFlagCache.fetchedAt,
        message: error instanceof Error ? error.message : String(error)
      });
      return maintenanceFlagCache.value;
    }
    console.error("maintenance_flag_check_failed_no_cache", {
      message: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

async function isIdentitySessionCurrent(identityId: string, accessVersion: number) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return false;

  try {
    const url = new URL("/rest/v1/passcode_profiles", supabaseUrl);
    url.searchParams.set("id", `eq.${identityId}`);
    url.searchParams.set("access_version", `eq.${accessVersion}`);
    url.searchParams.set("is_active", "eq.true");
    url.searchParams.set("or", `(expires_at.is.null,expires_at.gt.${new Date().toISOString()})`);
    url.searchParams.set("select", "id");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      },
      cache: "no-store"
    });
    if (!response.ok) return false;
    const rows = await response.json() as Array<{ id?: string }>;
    return rows[0]?.id === identityId;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isWrite = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const isExemptWrite = maintenanceWriteExemptions.some((prefix) => pathname.startsWith(prefix));
  if (pathname.startsWith("/api/") && isWrite && !isExemptWrite && await isMaintenanceEnabled()) {
    return NextResponse.json({ error: "ระบบอยู่ในโหมดบำรุงรักษาและปิดการแก้ไขข้อมูลชั่วคราว" }, { status: 503 });
  }
  const isProtected = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!isProtected) {
    return NextResponse.next();
  }

  const currentCookie = request.cookies.get(authCookieName)?.value;
  const session = await getSessionClaims(currentCookie);

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (session.mustRotate && pathname !== "/account/passcode") {
    return NextResponse.redirect(new URL("/account/passcode", request.url));
  }

  if (
    session.identityId &&
    session.accessVersion !== null &&
    !(await isIdentitySessionCurrent(session.identityId, session.accessVersion))
  ) {
    const response = NextResponse.redirect(new URL("/login?session=expired", request.url));
    response.cookies.set(authCookieName, "", { path: "/", maxAge: 0 });
    return response;
  }

  const requiredPermission = getRoutePermission(pathname);
  if (requiredPermission && !hasPermission(session, requiredPermission)) {
    const fallback = getFirstAllowedPath(session);
    const deniedUrl = new URL(fallback, request.url);
    deniedUrl.searchParams.set("access", "denied");
    return NextResponse.redirect(deniedUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/import/:path*",
    "/dashboard/:path*",
    "/analytics/:path*",
    "/cases/:path*",
    "/map/:path*",
    "/report/:path*",
    "/admin/:path*"
    ,"/account/:path*"
    ,"/api/:path*"
  ]
};
