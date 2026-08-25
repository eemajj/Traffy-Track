import { NextRequest, NextResponse } from "next/server";

import { APP_PERMISSIONS, normalizePermissions } from "@/lib/access-permissions";
import { getCurrentSessionClaims } from "@/lib/auth";
import { requireApiPermission } from "@/lib/api-auth";
import { recordAuditEvent } from "@/lib/audit";
import {
  hashPasscode,
  listPasscodeProfiles,
  validatePasscode
} from "@/lib/passcode-profiles";
import { createSupabaseAdminClient } from "@/lib/supabase";

type ProfileInput = {
  id?: unknown;
  displayName?: unknown;
  position?: unknown;
  roleLabel?: unknown;
  passcode?: unknown;
  permissions?: unknown;
  isAdmin?: unknown;
  isActive?: unknown;
  expiresAt?: unknown;
  mustRotate?: unknown;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseProfileInput(body: ProfileInput, options: { requirePasscode: boolean }) {
  const displayName = text(body.displayName, 120);
  const position = text(body.position, 160) || null;
  const roleLabel = text(body.roleLabel, 80);
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  const isAdmin = body.isAdmin === true;
  const isActive = body.isActive !== false;
  const permissions = isAdmin
    ? [...APP_PERMISSIONS]
    : normalizePermissions(body.permissions).filter((permission) => !permission.startsWith("admin:") && permission !== "system:maintenance");
  const expiresAtText = text(body.expiresAt, 64);
  const expiresAt = expiresAtText ? new Date(expiresAtText) : null;
  const mustRotate = body.mustRotate === true;

  if (displayName.length < 2) throw new Error("กรุณาระบุชื่ออย่างน้อย 2 ตัวอักษร");
  if (roleLabel.length < 2) throw new Error("กรุณาระบุบทบาทอย่างน้อย 2 ตัวอักษร");
  if (permissions.length === 0) throw new Error("กรุณาเลือกสิทธิ์อย่างน้อย 1 รายการ");
  if (options.requirePasscode || passcode.length > 0) validatePasscode(passcode);
  if (expiresAt && !Number.isFinite(expiresAt.getTime())) throw new Error("วันหมดอายุไม่ถูกต้อง");

  return { displayName, position, roleLabel, passcode, isAdmin, isActive, permissions, expiresAt: expiresAt?.toISOString() || null, mustRotate };
}

async function countActiveAdmins() {
  const result = await createSupabaseAdminClient()
    .from("passcode_profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_admin", true)
    .eq("is_active", true);
  if (result.error) throw new Error(result.error.message);
  return result.count || 0;
}

function databaseError(error: { code?: string; message?: string } | null, fallback: string) {
  if (error?.code === "23505") return "Passcode นี้ถูกใช้งานแล้ว กรุณากำหนดรหัสอื่น";
  return error?.message || fallback;
}

export async function GET() {
  const unauthorized = await requireApiPermission("admin:access");
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json({ profiles: await listPasscodeProfiles() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "โหลดรายการ Passcode ไม่สำเร็จ" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiPermission("admin:access");
  if (unauthorized) return unauthorized;
  const claims = await getCurrentSessionClaims();

  try {
    const input = parseProfileInput(await request.json() as ProfileInput, { requirePasscode: true });
    const result = await createSupabaseAdminClient()
      .from("passcode_profiles")
      .insert({
        display_name: input.displayName,
        position: input.position,
        role_label: input.roleLabel,
        passcode_digest: await hashPasscode(input.passcode),
        permissions: input.permissions,
        is_admin: input.isAdmin,
        is_active: input.isActive
        ,expires_at: input.expiresAt
        ,must_rotate: input.mustRotate
      })
      .select("id")
      .single();
    if (result.error) throw new Error(databaseError(result.error, "สร้าง Passcode ไม่สำเร็จ"));

    await recordAuditEvent({
      actorRole: claims?.role || "admin",
      action: "access.passcode_profile_created",
      resourceType: "passcode_profile",
      resourceId: result.data.id,
      metadata: {
        displayName: input.displayName,
        roleLabel: input.roleLabel,
        permissions: input.permissions,
        isAdmin: input.isAdmin
      }
    });
    return NextResponse.json({ id: result.data.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "สร้าง Passcode ไม่สำเร็จ" },
      { status: 400 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const unauthorized = await requireApiPermission("admin:access");
  if (unauthorized) return unauthorized;
  const claims = await getCurrentSessionClaims();

  try {
    const body = await request.json() as ProfileInput;
    const id = text(body.id, 64);
    if (!id) throw new Error("ไม่พบโปรไฟล์ที่ต้องการแก้ไข");
    const input = parseProfileInput(body, { requirePasscode: false });
    const supabase = createSupabaseAdminClient();
    const currentResult = await supabase
      .from("passcode_profiles")
      .select("id, display_name, is_admin, is_active")
      .eq("id", id)
      .maybeSingle();
    if (currentResult.error || !currentResult.data) throw new Error("ไม่พบโปรไฟล์ Passcode");

    const isSelf = claims?.identityId === id;
    if (isSelf && (!input.isAdmin || !input.isActive)) {
      throw new Error("ไม่สามารถลดสิทธิ์หรือระงับ Passcode ที่กำลังใช้งานอยู่ได้");
    }
    if (
      currentResult.data.is_admin &&
      currentResult.data.is_active &&
      (!input.isAdmin || !input.isActive) &&
      await countActiveAdmins() <= 1
    ) {
      throw new Error("ต้องมีผู้ดูแลระบบที่ใช้งานได้อย่างน้อย 1 รายการ");
    }

    const update: Record<string, unknown> = {
      display_name: input.displayName,
      position: input.position,
      role_label: input.roleLabel,
      permissions: input.permissions,
      is_admin: input.isAdmin,
      is_active: input.isActive
      ,expires_at: input.expiresAt
      ,must_rotate: input.mustRotate
    };
    if (input.passcode) update.passcode_digest = await hashPasscode(input.passcode);
    const result = await supabase.from("passcode_profiles").update(update).eq("id", id).select("id").single();
    if (result.error) throw new Error(databaseError(result.error, "แก้ไข Passcode ไม่สำเร็จ"));

    await recordAuditEvent({
      actorRole: claims?.role || "admin",
      action: "access.passcode_profile_updated",
      resourceType: "passcode_profile",
      resourceId: id,
      metadata: {
        displayName: input.displayName,
        roleLabel: input.roleLabel,
        permissions: input.permissions,
        isAdmin: input.isAdmin,
        isActive: input.isActive,
        passcodeChanged: Boolean(input.passcode)
      }
    });
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "แก้ไข Passcode ไม่สำเร็จ" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireApiPermission("admin:access");
  if (unauthorized) return unauthorized;
  const claims = await getCurrentSessionClaims();

  try {
    const id = text(request.nextUrl.searchParams.get("id"), 64);
    if (!id) throw new Error("ไม่พบโปรไฟล์ที่ต้องการลบ");
    if (claims?.identityId === id) throw new Error("ไม่สามารถลบ Passcode ที่กำลังใช้งานอยู่ได้");

    const supabase = createSupabaseAdminClient();
    const currentResult = await supabase
      .from("passcode_profiles")
      .select("id, display_name, is_admin, is_active")
      .eq("id", id)
      .maybeSingle();
    if (currentResult.error || !currentResult.data) throw new Error("ไม่พบโปรไฟล์ Passcode");
    if (currentResult.data.is_admin && currentResult.data.is_active && await countActiveAdmins() <= 1) {
      throw new Error("ไม่สามารถลบผู้ดูแลระบบคนสุดท้ายได้");
    }

    const result = await supabase.from("passcode_profiles").delete().eq("id", id);
    if (result.error) throw new Error(result.error.message);
    await recordAuditEvent({
      actorRole: claims?.role || "admin",
      action: "access.passcode_profile_deleted",
      resourceType: "passcode_profile",
      resourceId: id,
      metadata: { displayName: currentResult.data.display_name }
    });
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ลบ Passcode ไม่สำเร็จ" },
      { status: 400 }
    );
  }
}
