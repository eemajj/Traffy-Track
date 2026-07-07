import { NextResponse } from "next/server";

import { hasValidSessionCookie } from "@/lib/auth";

export async function requireApiSession() {
  if (await hasValidSessionCookie()) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
