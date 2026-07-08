import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { getAdminOverview } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const overview = await getAdminOverview();

  if (overview.status === "missing_env") {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  if (overview.status === "unavailable") {
    return NextResponse.json({ error: overview.message }, { status: 500 });
  }

  return NextResponse.json(overview, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
