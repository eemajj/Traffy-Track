import { unstable_noStore as noStore } from "next/cache";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";

export type SystemNotification = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  href: string | null;
  lastDetectedAt: string;
};

export async function listOpenNotifications(): Promise<SystemNotification[]> {
  if (!hasSupabaseAdminEnv()) return [];
  noStore();
  const result = await createSupabaseAdminClient()
    .from("system_notifications")
    .select("id,severity,title,message,href,last_detected_at")
    .eq("is_resolved", false)
    .order("last_detected_at", { ascending: false })
    .limit(20);
  if (result.error) {
    if (result.error.code === "42P01") return [];
    throw new Error(`โหลดการแจ้งเตือนไม่สำเร็จ: ${result.error.message}`);
  }
  return (result.data || []).map((row) => ({
    id: row.id,
    severity: row.severity as SystemNotification["severity"],
    title: row.title,
    message: row.message,
    href: row.href,
    lastDetectedAt: row.last_detected_at
  }));
}

async function setNotification(input: {
  key: string;
  active: boolean;
  severity: SystemNotification["severity"];
  title: string;
  message: string;
  href: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  if (!input.active) {
    await supabase.from("system_notifications").update({ is_resolved: true, resolved_at: now, updated_at: now }).eq("dedupe_key", input.key).eq("is_resolved", false);
    return;
  }
  const result = await supabase.from("system_notifications").upsert({
    dedupe_key: input.key,
    severity: input.severity,
    title: input.title,
    message: input.message,
    href: input.href,
    target_permissions: ["admin:manage"],
    is_resolved: false,
    resolved_at: null,
    last_detected_at: now,
    updated_at: now,
    metadata: input.metadata || {}
  }, { onConflict: "dedupe_key" });
  if (result.error) throw new Error(result.error.message);
}

export async function syncOperationalNotifications() {
  if (!hasSupabaseAdminEnv()) return { failedImports: 0, overdueReports: 0, queueIssues: 0 };
  const supabase = createSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const [imports, reports, outbox] = await Promise.all([
    supabase.from("import_batches").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("report_batches").select("id", { count: "exact", head: true }).lt("due_date", today).in("lifecycle_status", ["sent", "partially_returned"]),
    supabase.from("storage_deletion_outbox").select("id", { count: "exact", head: true }).in("status", ["failed", "dead"])
  ]);
  const failedImports = imports.count || 0;
  const overdueReports = reports.count || 0;
  const queueIssues = outbox.count || 0;
  await Promise.all([
    setNotification({ key: "failed-imports", active: failedImports > 0, severity: "critical", title: "พบงานนำเข้าที่ไม่สำเร็จ", message: `มีงานนำเข้าล้มเหลว ${failedImports} รายการ กรุณาตรวจสอบก่อนนำเข้ารอบใหม่`, href: "/admin", metadata: { count: failedImports } }),
    setNotification({ key: "overdue-reports", active: overdueReports > 0, severity: "warning", title: "รอบรายงานเกินกำหนด", message: `มีรอบรายงานที่ยังไม่เสร็จและเกินกำหนด ${overdueReports} รอบ`, href: "/report", metadata: { count: overdueReports } }),
    setNotification({ key: "storage-queue", active: queueIssues > 0, severity: "critical", title: "คิวจัดการไฟล์ต้องตรวจสอบ", message: `มีงานลบไฟล์ failed/dead-letter ${queueIssues} รายการ`, href: "/admin", metadata: { count: queueIssues } })
  ]);
  return { failedImports, overdueReports, queueIssues };
}
