import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { createImportCorrectionArtifact } from "@/lib/import/correction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("import:manage");
  if (unauthorized) return unauthorized;

  try {
    const payload = (await request.json()) as { path?: string; filename?: string };
    if (!payload.path?.startsWith("incoming/")) {
      return NextResponse.json({ error: "ตำแหน่งไฟล์นำเข้าไม่ถูกต้อง" }, { status: 400 });
    }

    const artifact = await createImportCorrectionArtifact(payload.path);
    const baseName = (payload.filename || "import.csv").replace(/\.csv$/i, "").replace(/[^a-zA-Z0-9ก-๙._-]+/g, "-");
    return new NextResponse(artifact.buffer, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName}-corrections.csv`)}`,
        "X-Correction-Issue-Count": String(artifact.issueCount)
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "สร้าง correction artifact ไม่สำเร็จ" },
      { status: 500 }
    );
  }
}
