import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { createSystemBackupExport } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const backup = await createSystemBackupExport();

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "สร้าง backup export ไม่สำเร็จ"
      },
      { status: 500 }
    );
  }
}
