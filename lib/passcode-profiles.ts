import { createHmac } from "node:crypto";

import { APP_PERMISSIONS, normalizePermissions, type AppPermission } from "@/lib/access-permissions";
import { env, hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";

export type PasscodeProfile = {
  id: string;
  displayName: string;
  position: string | null;
  roleLabel: string;
  permissions: AppPermission[];
  isAdmin: boolean;
  isActive: boolean;
  accessVersion: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  passcodeChangedAt: string;
  mustRotate: boolean;
  loginCount: number;
  createdAt: string;
  updatedAt: string;
};

type PasscodeProfileRow = {
  id: string;
  display_name: string;
  position: string | null;
  role_label: string;
  permissions: unknown;
  is_admin: boolean;
  is_active: boolean;
  access_version: number;
  last_used_at: string | null;
  expires_at: string | null;
  passcode_changed_at: string;
  must_rotate: boolean;
  login_count: number;
  created_at: string;
  updated_at: string;
};

const PROFILE_COLUMNS = [
  "id",
  "display_name",
  "position",
  "role_label",
  "permissions",
  "is_admin",
  "is_active",
  "access_version",
  "last_used_at",
  "expires_at",
  "passcode_changed_at",
  "must_rotate",
  "login_count",
  "created_at",
  "updated_at"
].join(",");

function getPasscodePepper() {
  const pepper = env.appPasscodePepper || process.env.APP_SESSION_SECRET;
  if (!pepper || new TextEncoder().encode(pepper).byteLength < 32) {
    throw new Error("APP_PASSCODE_PEPPER หรือ APP_SESSION_SECRET ต้องมีความยาวอย่างน้อย 32 bytes");
  }
  return pepper;
}

export function digestPasscode(passcode: string) {
  return createHmac("sha256", getPasscodePepper())
    .update(`citydata-passcode-v1:${passcode}`, "utf8")
    .digest("hex");
}

function mapProfile(row: PasscodeProfileRow): PasscodeProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    position: row.position,
    roleLabel: row.role_label,
    permissions: row.is_admin ? [...APP_PERMISSIONS] : normalizePermissions(row.permissions),
    isAdmin: row.is_admin,
    isActive: row.is_active,
    accessVersion: row.access_version,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    passcodeChangedAt: row.passcode_changed_at,
    mustRotate: row.must_rotate,
    loginCount: row.login_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function validatePasscode(passcode: string) {
  if (passcode.length < 6 || passcode.length > 128) {
    throw new Error("Passcode ต้องมีความยาว 6-128 ตัวอักษร");
  }
  if (passcode.trim() !== passcode) {
    throw new Error("Passcode ต้องไม่มีช่องว่างที่ต้นหรือท้าย");
  }
}

export async function findPasscodeProfile(passcode: string): Promise<PasscodeProfile | null> {
  if (!hasSupabaseAdminEnv() || passcode.length === 0) return null;

  const supabase = createSupabaseAdminClient();
  const result = await supabase
    .from("passcode_profiles")
    .select(PROFILE_COLUMNS)
    .eq("passcode_digest", digestPasscode(passcode))
    .eq("is_active", true)
    .maybeSingle();

  if (result.error) {
    // Allows a safe rollout before the migration reaches every environment.
    if (result.error.code === "42P01" || /passcode_profiles/i.test(result.error.message)) return null;
    throw new Error(`ตรวจสอบ Passcode ไม่สำเร็จ: ${result.error.message}`);
  }
  if (!result.data) return null;
  const row = result.data as unknown as PasscodeProfileRow;
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return null;

  await supabase
    .from("passcode_profiles")
    .update({ last_used_at: new Date().toISOString(), login_count: row.login_count + 1 })
    .eq("id", row.id);

  return mapProfile(row);
}

export async function listPasscodeProfiles(): Promise<PasscodeProfile[]> {
  if (!hasSupabaseAdminEnv()) return [];
  const result = await createSupabaseAdminClient()
    .from("passcode_profiles")
    .select(PROFILE_COLUMNS)
    .order("is_admin", { ascending: false })
    .order("display_name", { ascending: true });
  if (result.error) {
    if (result.error.code === "42P01") return [];
    throw new Error(`โหลดรายการ Passcode ไม่สำเร็จ: ${result.error.message}`);
  }
  return ((result.data || []) as unknown as PasscodeProfileRow[]).map(mapProfile);
}

export async function validatePasscodeProfileSession(input: {
  identityId: string;
  accessVersion: number;
}): Promise<PasscodeProfile | null> {
  if (!hasSupabaseAdminEnv()) return null;
  const result = await createSupabaseAdminClient()
    .from("passcode_profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", input.identityId)
    .eq("is_active", true)
    .eq("access_version", input.accessVersion)
    .maybeSingle();
  if (result.error || !result.data) return null;
  const row = result.data as unknown as PasscodeProfileRow;
  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return null;
  return mapProfile(row);
}

export function getLegacyPasscodeAccess(passcode: string) {
  if (env.appAdminPasscode && passcode === env.appAdminPasscode) {
    return { role: "admin" as const, label: "ผู้ดูแลระบบ (Environment)" };
  }
  if (env.appPasscode && passcode === env.appPasscode) {
    return {
      role: env.appAdminPasscode ? ("operator" as const) : ("admin" as const),
      label: env.appAdminPasscode ? "เจ้าหน้าที่ (Environment)" : "ผู้ดูแลระบบ (Environment)"
    };
  }
  return null;
}
