import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit";
import { getCurrentSessionClaims } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = await requireApiPermission("system:maintenance");
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json() as { enabled?: boolean; message?: string };
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    const message = String(body.message || "ระบบอยู่ระหว่างบำรุงรักษา กรุณาลองใหม่ภายหลัง").trim().slice(0, 500);
    const claims = await getCurrentSessionClaims();
    const now = new Date().toISOString();
    const result = await createSupabaseAdminClient().from("system_settings").update({
      maintenance_enabled: body.enabled,
      maintenance_message: message,
      maintenance_started_at: body.enabled ? now : null,
      maintenance_started_by: body.enabled ? claims?.displayName || "admin" : null,
      updated_at: now
    }).eq("singleton", true).select("maintenance_enabled,maintenance_message").single();
    if (result.error) throw new Error(result.error.message);
    await recordAuditEvent({ action: body.enabled ? "system.maintenance_enabled" : "system.maintenance_disabled", resourceType: "system", resourceId: "maintenance", metadata: { message } });
    revalidatePath("/", "layout");
    return NextResponse.json({ status: "ok", ...result.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "เปลี่ยนโหมดบำรุงรักษาไม่สำเร็จ" }, { status: 500 });
  }
}
