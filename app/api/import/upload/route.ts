import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import {
  createSignedUploadTarget,
  IMPORT_ALLOWED_TYPES,
  IMPORT_BUCKET,
  IMPORT_MAX_BYTES,
  sanitizeStorageSegment
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = (await request.json()) as {
      filename?: string;
      contentType?: string;
      size?: number;
    };

    const filename = String(payload.filename || "").trim();
    const contentType = String(payload.contentType || "");
    const size = Number(payload.size || 0);

    if (!filename) {
      return NextResponse.json({ error: "ไม่พบชื่อไฟล์ CSV" }, { status: 400 });
    }

    if (!IMPORT_ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json({ error: "รองรับเฉพาะไฟล์ CSV" }, { status: 400 });
    }

    if (!Number.isFinite(size) || size <= 0 || size > IMPORT_MAX_BYTES) {
      return NextResponse.json({ error: "ไฟล์ CSV ต้องมีขนาดไม่เกิน 80 MB" }, { status: 400 });
    }

    const fileExt = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() || "csv" : "csv";
    const safeFileName = sanitizeStorageSegment(filename.replace(/\.[^.]+$/, "")) || "citydata";
    const objectPath = `incoming/${Date.now()}-${crypto.randomUUID()}-${safeFileName}.${fileExt}`;
    const uploadTarget = await createSignedUploadTarget({
      bucket: IMPORT_BUCKET,
      path: objectPath,
      fileSizeLimit: IMPORT_MAX_BYTES,
      allowedMimeTypes: [...IMPORT_ALLOWED_TYPES].filter(Boolean)
    });

    return NextResponse.json(uploadTarget, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "สร้างสิทธิ์อัปโหลดไฟล์ไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
