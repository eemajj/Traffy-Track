import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/api-auth";
import { resolveApiServiceResult } from "@/lib/api-service-result";
import { getAdminOverview } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireApiRole("admin");
  if (unauthorized) {
    return unauthorized;
  }

  const overview = await getAdminOverview();
  const resolution = resolveApiServiceResult(overview, { unavailableMessage: "โหลดสถานะผู้ดูแลไม่สำเร็จ" });
  if (!resolution.ok) {
    return NextResponse.json(resolution.error.body, { status: resolution.error.status });
  }

  return NextResponse.json(resolution.value, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
