import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { waitUntil } from "@vercel/functions";

import { requireApiSession } from "@/lib/api-auth";
import { createQueuedImportBatch, processImportCsv, processImportCsvFromStorage } from "@/lib/import/process";
import { recordAuditEvent } from "@/lib/audit";
import { TICKET_FILTER_OPTIONS_TAG } from "@/lib/ticket-filter-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function runImportJob(input: {
  path: string;
  filename: string;
  importBatchId: string;
}) {
  try {
    const summary = await processImportCsvFromStorage(input);
    await recordAuditEvent({
      action: "import.completed",
      resourceType: "import_batch",
      resourceId: input.importBatchId,
      actorRole: "system",
      metadata: { filename: input.filename, processedRows: summary.processedRows }
    });
    revalidatePath("/dashboard");
    revalidatePath("/report");
    revalidatePath("/cases");
    revalidateTag(TICKET_FILTER_OPTIONS_TAG, { expire: 0 });
  } catch (error) {
    await recordAuditEvent({
      action: "import.failed",
      resourceType: "import_batch",
      resourceId: input.importBatchId,
      actorRole: "system",
      outcome: "failure",
      metadata: {
        filename: input.filename,
        message: error instanceof Error ? error.message : "unknown error"
      }
    });
    console.error("Background import job failed", {
      importBatchId: input.importBatchId,
      filename: input.filename,
      message: error instanceof Error ? error.message : "นำเข้าข้อมูลไม่สำเร็จโดยไม่ทราบสาเหตุ",
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
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
        filename: payload.filename
      });
      await recordAuditEvent({
        action: "import.queued",
        resourceType: "import_batch",
        resourceId: job.importBatchId,
        metadata: { filename: payload.filename }
      });

      waitUntil(
        runImportJob({
          path: payload.path,
          filename: payload.filename,
          importBatchId: job.importBatchId
        })
      );

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
