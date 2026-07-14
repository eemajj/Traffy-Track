import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/api-auth";
import { previewSystemWipe, wipeSystemData } from "@/lib/admin";
import { recordAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeMode(value: unknown) {
  return value === "all" ? "all" : "reports";
}

export async function GET(request: Request) {
  const unauthorized = await requireApiRole("admin");
  if (unauthorized) {
    return unauthorized;
  }

  const url = new URL(request.url);
  const mode = normalizeMode(url.searchParams.get("mode"));
  const preview = await previewSystemWipe(mode);

  if (preview.status === "missing_env") {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  if (preview.status === "unavailable") {
    return NextResponse.json({ error: preview.message }, { status: 500 });
  }

  return NextResponse.json(preview, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(request: Request) {
  const unauthorized = await requireApiRole("admin");
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = (await request.json()) as {
      mode?: string;
      confirmation?: string;
    };

    const result = await wipeSystemData({
      mode: normalizeMode(payload.mode),
      confirmation: payload.confirmation || ""
    });
    await recordAuditEvent({
      action: "system.wipe",
      resourceType: "system",
      resourceId: normalizeMode(payload.mode),
      metadata: { mode: normalizeMode(payload.mode) }
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    await recordAuditEvent({
      action: "system.wipe",
      resourceType: "system",
      resourceId: "attempt",
      outcome: "failure",
      metadata: { message: error instanceof Error ? error.message : "unknown error" }
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "ล้างข้อมูลระบบไม่สำเร็จ"
      },
      { status: 400 }
    );
  }
}
