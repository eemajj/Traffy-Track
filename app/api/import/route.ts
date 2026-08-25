import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { waitUntil } from "@vercel/functions";

import { requireApiSession } from "@/lib/api-auth";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { createQueuedImportBatch } from "@/lib/import/process";
import { runDurableImportWorker } from "@/lib/import/worker";
import { recordAuditEvent } from "@/lib/audit";
import { DASHBOARD_CACHE_TAG } from "@/lib/dashboard";
import { TICKET_FILTER_OPTIONS_TAG } from "@/lib/ticket-filter-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("import:manage");
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { error: "รองรับเฉพาะการนำเข้าผ่าน JSON payload (V2 storage-backed import)" },
        { status: 400 }
      );
    }

    const payload = (await request.json()) as {
      path?: string;
      filename?: string;
    };

    if (!payload.path || !payload.filename) {
      return NextResponse.json({ error: "ไม่พบตำแหน่งไฟล์ CSV สำหรับนำเข้า" }, { status: 400 });
    }

    if (!payload.path.startsWith("incoming/")) {
      return NextResponse.json({ error: "ตำแหน่งไฟล์นำเข้าไม่ถูกต้อง" }, { status: 400 });
    }

    const job = await createQueuedImportBatch({
      filename: payload.filename,
      storagePath: payload.path
    });

    await recordAuditEvent({
      action: "import.queued",
      resourceType: "import_batch",
      resourceId: job.importBatchId,
      metadata: { filename: payload.filename }
    });

    // Automatically trigger import background worker execution without blocking client response
    waitUntil(
      (async () => {
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
        } catch (workerError) {
          console.error("Background import worker execution failed:", workerError);
        }
      })()
    );

    return NextResponse.json(job, {
      status: 202,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "นำเข้าข้อมูลไม่สำเร็จโดยไม่ทราบสาเหตุ";
    console.error("Import API failed", {
      message,
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
