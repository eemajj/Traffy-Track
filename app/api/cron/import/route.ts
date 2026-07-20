import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { isCronAuthorizationValid } from "@/lib/cron-auth";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { DASHBOARD_CACHE_TAG } from "@/lib/dashboard";
import { env, hasSupabaseAdminEnv } from "@/lib/env";
import { runDurableImportWorker } from "@/lib/import/worker";
import { TICKET_FILTER_OPTIONS_TAG } from "@/lib/ticket-filter-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!env.cronSecret) {
    return NextResponse.json(
      { status: "misconfigured", error: "CRON_SECRET is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!isCronAuthorizationValid(request.headers.get("authorization"), env.cronSecret)) {
    return NextResponse.json(
      { status: "unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { status: "misconfigured", error: "Supabase admin environment is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
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

    return NextResponse.json(
      {
        status: worker.failed > 0 || worker.leaseLost > 0 ? "degraded" : "ok",
        checkedAt: new Date().toISOString(),
        worker
      },
      {
        status: worker.leaseLost > 0 ? 500 : 200,
        headers: { "Cache-Control": "no-store" }
      }
    );
  } catch (error) {
    console.error("Durable import worker failed", error);
    return NextResponse.json(
      {
        status: "degraded",
        error: error instanceof Error ? error.message : "Durable import worker failed"
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
