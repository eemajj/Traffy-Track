import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { previewImportCsvFromStorage } from "@/lib/import/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession("import:manage");
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = (await request.json()) as {
      path?: string;
      filename?: string;
      size?: number;
    };

    if (!payload.path || !payload.filename) {
      return NextResponse.json({ error: "ไม่พบไฟล์ CSV สำหรับตรวจเบื้องต้น" }, { status: 400 });
    }

    if (!payload.path.startsWith("incoming/")) {
      return NextResponse.json({ error: "ตำแหน่งไฟล์นำเข้าไม่ถูกต้อง" }, { status: 400 });
    }

    const preview = await previewImportCsvFromStorage({
      path: payload.path,
      filename: payload.filename,
      fileSize: Number.isFinite(payload.size) ? Number(payload.size) : null
    });

    return NextResponse.json(preview, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ตรวจไฟล์นำเข้าไม่สำเร็จ";
    console.error("Import preview failed", {
      message,
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
