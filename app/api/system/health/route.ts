import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { getAdminOverview } from "@/lib/admin";
import { env, hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { buildClosedStatesFilter } from "@/lib/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const checks = {
    appPasscode: Boolean(env.appPasscode),
    supabaseAdminEnv: hasSupabaseAdminEnv(),
    database: false,
    storage: false
  };

  if (!checks.supabaseAdminEnv) {
    return NextResponse.json(
      {
        status: "misconfigured",
        checks
      },
      { status: 500 }
    );
  }

  try {
    const supabase = createSupabaseAdminClient();
    const closedFilter = buildClosedStatesFilter();
    const [ticketCountResult, pendingCountResult, latestImportResult, bucketResult] = await Promise.all([
      supabase.from("tickets").select("ticket_id", { count: "exact", head: true }),
      supabase.from("tickets").select("ticket_id", { count: "exact", head: true }).not("state", "in", closedFilter),
      supabase
        .from("import_batches")
        .select("id, imported_at, filename, total_rows, new_tickets, changed_tickets, unchanged_tickets")
        .order("imported_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.storage.getBucket("report-evidence")
    ]);

    checks.database = !ticketCountResult.error && !pendingCountResult.error && !latestImportResult.error;
    checks.storage = !bucketResult.error;

    const status = checks.database && checks.storage ? "ok" : "degraded";
    const adminOverview = await getAdminOverview();

    return NextResponse.json(
      {
        status,
        checks,
        tickets: {
          total: ticketCountResult.count || 0,
          pending: pendingCountResult.count || 0
        },
        latestImport: latestImportResult.data || null,
        usage:
          adminOverview.status === "ready"
            ? {
                database: adminOverview.database,
                storage: adminOverview.storage,
                limits: adminOverview.limits
              }
            : null,
        errors: [
          ticketCountResult.error?.message,
          pendingCountResult.error?.message,
          latestImportResult.error?.message,
          bucketResult.error?.message
        ].filter(Boolean)
      },
      {
        status: status === "ok" ? 200 : 500,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        checks,
        errors: [error instanceof Error ? error.message : "Unknown health check error"]
      },
      { status: 500 }
    );
  }
}
