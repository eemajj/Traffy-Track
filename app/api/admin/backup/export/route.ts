import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/api-auth";
import { createSystemBackupExport } from "@/lib/admin";
import { recordAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const unauthorized = await requireApiRole("admin");
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const backup = await createSystemBackupExport();
    await recordAuditEvent({
      action: "backup.export",
      resourceType: "system",
      metadata: {
        sizeBytes: backup.sizeBytes,
        storageObjects: backup.storageObjects,
        tableRows: backup.tableRows.reduce((sum, table) => sum + table.rows, 0)
      }
    });

    return new NextResponse(backup.buffer, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/zip",
        "Content-Length": String(backup.sizeBytes),
        "Content-Disposition": `attachment; filename="${backup.filename}"`,
        "X-Backup-Storage-Objects": String(backup.storageObjects),
        "X-Backup-Table-Rows": String(backup.tableRows.reduce((sum, table) => sum + table.rows, 0))
      }
    });
  } catch (error) {
    await recordAuditEvent({
      action: "backup.export",
      resourceType: "system",
      outcome: "failure",
      metadata: { message: error instanceof Error ? error.message : "unknown error" }
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "สร้าง backup export ไม่สำเร็จ"
      },
      { status: 500 }
    );
  }
}
