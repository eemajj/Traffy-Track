import { NextRequest, NextResponse } from "next/server";

import { hasPermission } from "@/lib/access-permissions";
import { getCurrentSessionClaims } from "@/lib/auth";
import { getWorkflowActionCenter } from "@/lib/workflow";

export async function GET(request: NextRequest) {
  const claims = await getCurrentSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(claims, "dashboard:view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    return NextResponse.json({ items: await getWorkflowActionCenter(request.nextUrl.searchParams.get("today") || undefined) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "โหลดงานวันนี้ไม่สำเร็จ" }, { status: 400 });
  }
}
