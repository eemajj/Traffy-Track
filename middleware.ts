import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifySessionCookieValue } from "@/lib/session";

const authCookieName = process.env.APP_AUTH_COOKIE || "citydata-passcode";

const protectedPrefixes = ["/import", "/dashboard", "/cases", "/report", "/admin"];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isProtected = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (!isProtected) {
    return NextResponse.next();
  }

  const currentCookie = request.cookies.get(authCookieName)?.value;
  const isAuthenticated = await verifySessionCookieValue(currentCookie);

  if (isAuthenticated) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/import/:path*", "/dashboard/:path*", "/cases/:path*", "/report/:path*", "/admin/:path*"]
};
