import { NextResponse } from "next/server";

import { getCurrentSessionClaims, hasValidSessionCookie } from "@/lib/auth";
import { SessionRole } from "@/lib/session";

export async function requireApiSession() {
  if (await hasValidSessionCookie()) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function requireApiRole(role: SessionRole) {
  const claims = await getCurrentSessionClaims();

  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (claims.role !== role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
