import { unstable_noStore as noStore } from "next/cache";

import { getCurrentSessionClaims } from "@/lib/auth";
import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";

export type AuditOutcome = "success" | "failure";

export type AuditEvent = {
  id: number;
  occurredAt: string;
  actorRole: "admin" | "operator" | "system";
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: AuditOutcome;
  metadata: Record<string, unknown>;
};

export async function recordAuditEvent(input: {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: AuditOutcome;
  metadata?: Record<string, unknown>;
  actorRole?: AuditEvent["actorRole"];
}) {
  if (!hasSupabaseAdminEnv()) {
    return false;
  }

  try {
    const session = input.actorRole ? null : await getCurrentSessionClaims();
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("audit_events").insert({
      actor_role: input.actorRole || session?.role || "system",
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId || null,
      outcome: input.outcome || "success",
      metadata: input.metadata || {}
    });

    if (error) {
      console.error("Audit event write failed", { action: input.action, message: error.message });
      return false;
    }

    return true;
  } catch (error) {
    console.error("Audit event write failed", {
      action: input.action,
      message: error instanceof Error ? error.message : "unknown error"
    });
    return false;
  }
}

export async function getRecentAuditEvents(limit = 50): Promise<
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | { status: "ready"; events: AuditEvent[] }
> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

  try {
    noStore();
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("audit_events")
      .select("id, occurred_at, actor_role, action, resource_type, resource_id, outcome, metadata")
      .order("occurred_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));

    if (error) {
      throw new Error(error.message);
    }

    return {
      status: "ready",
      events: ((data || []) as Array<{
        id: number;
        occurred_at: string;
        actor_role: AuditEvent["actorRole"];
        action: string;
        resource_type: string;
        resource_id: string | null;
        outcome: AuditOutcome;
        metadata: Record<string, unknown> | null;
      }>).map((row) => ({
        id: row.id,
        occurredAt: row.occurred_at,
        actorRole: row.actor_role,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        outcome: row.outcome,
        metadata: row.metadata || {}
      }))
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "โหลด audit log ไม่สำเร็จ"
    };
  }
}
