import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api-auth";
import { createSystemBackupExport } from "@/lib/admin";
import { recordAuditEvent } from "@/lib/audit";
import { buildPrivilegedFailureAudit, buildPrivilegedSuccessAudit } from "@/lib/privileged-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKUP_RETENTION_DAYS = 30;

export async function POST() {
  const unauthorized = await requireApiPermission("admin:backup");
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const backup = await createSystemBackupExport();
    const backupId = randomUUID();
    const sha256 = createHash("sha256").update(backup.buffer).digest("hex");
    const retainUntil = new Date(Date.now() + BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await recordAuditEvent(buildPrivilegedSuccessAudit({
      action: "backup.export",
      resourceType: "backup_artifact",
      resourceId: backupId,
      metadata: {
        sha256,
        sizeBytes: backup.sizeBytes,
        storageObjects: backup.storageObjects,
        tableRows: backup.tableRows.reduce((sum, table) => sum + table.rows, 0),
        retentionDays: BACKUP_RETENTION_DAYS,
        retainUntil,
        encrypted: false
      }
    }));

    return new NextResponse(backup.buffer, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/zip",
        "Content-Length": String(backup.sizeBytes),
        "Content-Disposition": `attachment; filename="${backup.filename}"`,
        "X-Backup-Id": backupId,
        "X-Backup-SHA256": sha256,
        "X-Backup-Retention-Days": String(BACKUP_RETENTION_DAYS),
        "X-Backup-Retain-Until": retainUntil,
        "X-Backup-Storage-Objects": String(backup.storageObjects),
        "X-Backup-Table-Rows": String(backup.tableRows.reduce((sum, table) => sum + table.rows, 0))
      }
    });
  } catch (error) {
    await recordAuditEvent(buildPrivilegedFailureAudit({
      action: "backup.export",
      resourceType: "backup_artifact",
      error
    }));
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "สร้าง backup export ไม่สำเร็จ"
      },
      { status: 500 }
    );
  }
}
