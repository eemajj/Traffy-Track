import { NextResponse } from "next/server";

import { hasPermission, type AppPermission } from "@/lib/access-permissions";
import { getCurrentSessionClaims } from "@/lib/auth";
import { SessionRole } from "@/lib/session";

export async function requireApiSession(permission?: AppPermission) {
  const claims = await getCurrentSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (permission && !hasPermission(claims, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
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

export async function requireApiPermission(permission: AppPermission) {
  const claims = await getCurrentSessionClaims();
  if (!claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasPermission(claims, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}
