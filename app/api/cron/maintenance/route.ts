import { NextResponse } from "next/server";

import { isCronAuthorizationValid } from "@/lib/cron-auth";
import { env, hasSupabaseAdminEnv } from "@/lib/env";
import { cleanupTemporaryStorage } from "@/lib/maintenance";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const supabase = createSupabaseAdminClient();
    const [keepaliveResult, cleanup] = await Promise.all([
      supabase.from("tickets").select("ticket_id").limit(1),
      cleanupTemporaryStorage(supabase)
    ]);

    if (keepaliveResult.error) {
      throw new Error(`Supabase keepalive failed: ${keepaliveResult.error.message}`);
    }

    return NextResponse.json(
      {
        status: "ok",
        checkedAt: new Date().toISOString(),
        cleanup
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Scheduled maintenance failed", error);

    return NextResponse.json(
      {
        status: "degraded",
        error: error instanceof Error ? error.message : "Scheduled maintenance failed"
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
