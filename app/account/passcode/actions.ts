"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { recordAuditEvent } from "@/lib/audit";
import { getCurrentSessionClaims } from "@/lib/auth";
import { env } from "@/lib/env";
import { digestPasscode, validatePasscode } from "@/lib/passcode-profiles";
import { createSupabaseAdminClient } from "@/lib/supabase";

export type ChangePasscodeState = { error?: string };

export async function changeOwnPasscodeAction(_: ChangePasscodeState, formData: FormData): Promise<ChangePasscodeState> {
  const claims = await getCurrentSessionClaims();
  if (!claims?.identityId) return { error: "Passcode สำรองจาก Environment ไม่สามารถเปลี่ยนจากหน้านี้ได้" };
  const passcode = String(formData.get("passcode") || "");
  const confirmation = String(formData.get("confirmation") || "");
  try {
    validatePasscode(passcode);
    if (passcode !== confirmation) return { error: "Passcode ทั้งสองช่องไม่ตรงกัน" };
    const result = await createSupabaseAdminClient().from("passcode_profiles").update({ passcode_digest: digestPasscode(passcode), must_rotate: false }).eq("id", claims.identityId).select("id").single();
    if (result.error) throw new Error(result.error.message);
    await recordAuditEvent({ action: "access.passcode_rotated", resourceType: "passcode_profile", resourceId: claims.identityId, actorRole: claims.role, metadata: { selfService: true } });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "เปลี่ยน Passcode ไม่สำเร็จ" };
  }
  const cookieStore = await cookies();
  cookieStore.set(env.authCookieName, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  redirect("/login?passcode=changed");
}
