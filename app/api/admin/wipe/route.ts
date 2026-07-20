import { NextResponse } from "next/server";

import { requireApiRole } from "@/lib/api-auth";
import { resolveApiServiceResult } from "@/lib/api-service-result";
import { previewSystemWipe, wipeSystemData } from "@/lib/admin";
import { recordAuditEvent } from "@/lib/audit";
import { buildPrivilegedFailureAudit, buildPrivilegedSuccessAudit } from "@/lib/privileged-audit";

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
  const resolution = resolveApiServiceResult(preview, { unavailableMessage: "โหลดตัวอย่างการล้างข้อมูลไม่สำเร็จ" });
  if (!resolution.ok) {
    return NextResponse.json(resolution.error.body, { status: resolution.error.status });
  }

  return NextResponse.json(resolution.value, {
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
    await recordAuditEvent(buildPrivilegedSuccessAudit({
      action: "system.wipe",
      resourceType: "system",
      resourceId: normalizeMode(payload.mode),
      metadata: { mode: normalizeMode(payload.mode) }
    }));

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    await recordAuditEvent(buildPrivilegedFailureAudit({
      action: "system.wipe",
      resourceType: "system",
      resourceId: "attempt",
      error
    }));
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "ล้างข้อมูลระบบไม่สำเร็จ"
      },
      { status: 400 }
    );
  }
}
