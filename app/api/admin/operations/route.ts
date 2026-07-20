import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit";
import { buildPrivilegedFailureAudit, buildPrivilegedSuccessAudit } from "@/lib/privileged-audit";
import { hasSupabaseAdminEnv } from "@/lib/env";
import {
  cleanupTemporaryStorage,
  recoverStaleImportJobs,
  reconcileStorageDeletionOutbox,
  retryFailedStorageDeletionJobs
} from "@/lib/maintenance";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_OVERVIEW_CACHE_TAG = "admin-overview";

function refreshAdminOverview() {
  revalidateTag(ADMIN_OVERVIEW_CACHE_TAG, { expire: 0 });
  revalidatePath("/admin");
}

type OperationsAction = "run-maintenance" | "retry-storage-queue";

async function runStage<T>(name: string, run: () => Promise<T>) {
  try {
    return { status: "ok" as const, result: await run() };
  } catch (error) {
    const message = error instanceof Error ? error.message : `${name} failed`;
    return { status: "degraded" as const, error: message };
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireApiPermission("admin:operations");
  if (unauthorized) return unauthorized;

  let action: OperationsAction | null = null;

  try {
    if (!hasSupabaseAdminEnv()) {
      throw new Error("ระบบยังไม่ได้ตั้งค่า Supabase");
    }

    const payload = (await request.json()) as { action?: string; confirmation?: string };
    action = payload.action === "run-maintenance" || payload.action === "retry-storage-queue"
      ? payload.action
      : null;

    if (!action) {
      return NextResponse.json({ error: "ไม่รู้จักคำสั่ง operations" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    if (action === "retry-storage-queue") {
      if (payload.confirmation !== "RETRY STORAGE QUEUE") {
        return NextResponse.json(
          { error: "กรุณาพิมพ์ RETRY STORAGE QUEUE เพื่อยืนยัน" },
          { status: 400 }
        );
      }

      const result = await retryFailedStorageDeletionJobs(supabase);
      await recordAuditEvent(buildPrivilegedSuccessAudit({
        action: "operations.storage_queue_retried",
        resourceType: "storage_deletion_outbox",
        resourceId: "bulk",
        metadata: { retried: result.retried, jobIds: result.jobIds }
      }));
      refreshAdminOverview();
      return NextResponse.json({ status: "ok", action, ...result });
    }

    const staleImports = await runStage("stale-import-recovery", () => recoverStaleImportJobs(supabase));
    const storageDeletionOutbox = await runStage("storage-deletion-outbox", () =>
      reconcileStorageDeletionOutbox(supabase)
    );
    const temporaryStorage = await runStage("temporary-storage-cleanup", () => cleanupTemporaryStorage(supabase));
    const degraded = [staleImports, storageDeletionOutbox, temporaryStorage]
      .some((stage) => stage.status === "degraded");

    await recordAuditEvent(buildPrivilegedSuccessAudit({
      action: "operations.maintenance_run",
      resourceType: "system",
      resourceId: "manual",
      degraded,
      metadata: { staleImports, storageDeletionOutbox, temporaryStorage }
    }));
    refreshAdminOverview();

    return NextResponse.json(
      {
        status: degraded ? "degraded" : "ok",
        action,
        checkedAt: new Date().toISOString(),
        stages: { staleImports, storageDeletionOutbox, temporaryStorage }
      },
      { status: degraded ? 500 : 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "ดำเนินการ operations ไม่สำเร็จ";
    await recordAuditEvent(buildPrivilegedFailureAudit({
      action: action === "retry-storage-queue"
        ? "operations.storage_queue_retried"
        : "operations.maintenance_run",
      resourceType: action === "retry-storage-queue" ? "storage_deletion_outbox" : "system",
      resourceId: action || "unknown",
      error: new Error(message)
    }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
