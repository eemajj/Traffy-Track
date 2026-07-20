import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { DASHBOARD_CACHE_TAG } from "@/lib/dashboard";
import { hasSupabaseAdminEnv } from "@/lib/env";
import { runDurableImportWorker } from "@/lib/import/worker";
import { TICKET_FILTER_OPTIONS_TAG } from "@/lib/ticket-filter-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const unauthorized = await requireApiSession("import:manage");
  if (unauthorized) return unauthorized;

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 503 });
  }

  try {
    const worker = await runDurableImportWorker(1);
    if (worker.completed > 0) {
      revalidatePath("/dashboard");
      revalidatePath("/report");
      revalidatePath("/cases");
      revalidateTag(DASHBOARD_CACHE_TAG, { expire: 0 });
      revalidateTag(ANALYTICS_CACHE_TAG, { expire: 0 });
      revalidateTag(TICKET_FILTER_OPTIONS_TAG, { expire: 0 });
    }
    return NextResponse.json({ status: "ok", worker }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "เริ่ม worker นำเข้าไม่สำเร็จ" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
