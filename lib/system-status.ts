import { unstable_noStore as noStore } from "next/cache";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";

export type SystemStatus = {
  latestImportAt: string | null;
  latestImportFilename: string | null;
  latestImportStatus: string | null;
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  openNotifications: number;
};

const fallback: SystemStatus = {
  latestImportAt: null,
  latestImportFilename: null,
  latestImportStatus: null,
  maintenanceEnabled: false,
  maintenanceMessage: "ระบบอยู่ระหว่างบำรุงรักษา กรุณาลองใหม่ภายหลัง",
  openNotifications: 0
};

export async function getSystemStatus(): Promise<SystemStatus> {
  if (!hasSupabaseAdminEnv()) return fallback;
  noStore();
  const supabase = createSupabaseAdminClient();
  const [importResult, settingsResult, notificationResult] = await Promise.all([
    supabase.from("import_batches").select("filename,imported_at,status").order("imported_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("system_settings").select("maintenance_enabled,maintenance_message").eq("singleton", true).maybeSingle(),
    supabase.from("system_notifications").select("id", { count: "exact", head: true }).eq("is_resolved", false)
  ]);

  return {
    latestImportAt: importResult.data?.imported_at || null,
    latestImportFilename: importResult.data?.filename || null,
    latestImportStatus: importResult.data?.status || null,
    maintenanceEnabled: settingsResult.data?.maintenance_enabled === true,
    maintenanceMessage: settingsResult.data?.maintenance_message || fallback.maintenanceMessage,
    openNotifications: notificationResult.count || 0
  };
}

export async function isMaintenanceModeEnabled() {
  const status = await getSystemStatus();
  return status.maintenanceEnabled;
}

export async function assertSystemWritable() {
  if (await isMaintenanceModeEnabled()) {
    throw new Error("ระบบอยู่ในโหมดบำรุงรักษาและปิดการแก้ไขข้อมูลชั่วคราว");
  }
}
