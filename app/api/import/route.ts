import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { requireApiSession } from "@/lib/api-auth";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { createQueuedImportBatch, processImportCsv } from "@/lib/import/process";
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

    if (contentType.includes("application/json")) {
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

      return NextResponse.json(job, {
        status: 202,
        headers: {
          "Cache-Control": "no-store"
        }
      });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "ไม่พบไฟล์ CSV สำหรับนำเข้า" }, { status: 400 });
    }

    const summary = await processImportCsv(file);
    await recordAuditEvent({
      action: "import.completed",
      resourceType: "import_batch",
      resourceId: summary.importBatchId,
      metadata: { filename: summary.filename, processedRows: summary.processedRows }
    });
    revalidatePath("/dashboard");
    revalidatePath("/report");
    revalidatePath("/cases");
    revalidateTag(DASHBOARD_CACHE_TAG, { expire: 0 });
    revalidateTag(ANALYTICS_CACHE_TAG, { expire: 0 });
    revalidateTag(TICKET_FILTER_OPTIONS_TAG, { expire: 0 });

    return NextResponse.json(summary, {
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
