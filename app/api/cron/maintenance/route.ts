import { NextResponse } from "next/server";

import { isCronAuthorizationValid } from "@/lib/cron-auth";
import { env, hasSupabaseAdminEnv } from "@/lib/env";
import {
  cleanupTemporaryStorage,
  recoverStaleImportJobs,
  reconcileStorageDeletionOutbox
} from "@/lib/maintenance";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { syncOperationalNotifications } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runMaintenanceStage<T>(name: string, run: () => Promise<T>) {
  try {
    return { status: "ok" as const, result: await run() };
  } catch (error) {
    const message = error instanceof Error ? error.message : `${name} failed`;
    console.error("Scheduled maintenance stage failed", { stage: name, message });
    return { status: "degraded" as const, error: message };
  }
}

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
    const keepaliveResult = await supabase.from("tickets").select("ticket_id").limit(1);

    if (keepaliveResult.error) {
      throw new Error(`Supabase keepalive failed: ${keepaliveResult.error.message}`);
    }

    const staleImports = await runMaintenanceStage("stale-import-recovery", () =>
      recoverStaleImportJobs(supabase)
    );
    const storageDeletionOutbox = await runMaintenanceStage("storage-deletion-outbox", () =>
      reconcileStorageDeletionOutbox(supabase)
    );
    const temporaryCleanup = await runMaintenanceStage("temporary-storage-cleanup", () =>
      cleanupTemporaryStorage(supabase)
    );
    const notifications = await runMaintenanceStage("operational-notifications", () => syncOperationalNotifications());
    const degraded = [staleImports, storageDeletionOutbox, temporaryCleanup, notifications]
      .some((stage) => stage.status === "degraded");

    return NextResponse.json(
      {
        status: degraded ? "degraded" : "ok",
        checkedAt: new Date().toISOString(),
        stages: {
          staleImports,
          storageDeletionOutbox,
          temporaryStorage: temporaryCleanup,
          notifications
        }
      },
      {
        status: degraded ? 500 : 200,
        headers: { "Cache-Control": "no-store" }
      }
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
