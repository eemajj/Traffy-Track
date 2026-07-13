import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getSessionClaims } from "@/lib/session";

const authCookieName = process.env.APP_AUTH_COOKIE || "citydata-passcode";

const protectedPrefixes = ["/import", "/dashboard", "/analytics", "/cases", "/map", "/report", "/admin"];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
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

  if ((pathname === "/admin" || pathname.startsWith("/admin/")) && session.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard?access=denied", request.url));
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
  ]
};
