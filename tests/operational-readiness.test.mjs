import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("operational readiness migration is additive, service-role-only, and backup-aware", async () => {
  const migration = await read("supabase/migrations/20260715220000_operational_readiness_features.sql");
  assert.match(migration, /add column if not exists expires_at/);
  assert.match(migration, /add column if not exists must_rotate/);
  assert.match(migration, /create table if not exists public\.system_settings/);
  assert.match(migration, /create table if not exists public\.system_notifications/);
  assert.match(migration, /revoke all privileges[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /'system_settings'/);
  assert.match(migration, /'system_notifications'/);
  assert.doesNotMatch(migration, /drop table|truncate/i);
});

test("maintenance mode blocks API writes while keeping recovery, backup, cron, and login paths available", async () => {
  const [proxy, actions, route] = await Promise.all([
    read("proxy.ts"), read("app/report/actions.ts"), read("app/api/admin/maintenance/route.ts")
  ]);
  assert.match(proxy, /pathname\.startsWith\("\/api\/"\).*isWrite/);
  assert.match(proxy, /\/api\/admin\/maintenance/);
  assert.match(proxy, /\/api\/admin\/backup\/export/);
  assert.match(actions, /assertSystemWritable/);
  assert.match(route, /system\.maintenance_enabled/);
  assert.match(route, /system\.maintenance_disabled/);
});

test("executive PDF and comparison share the analytics source and require export permission", async () => {
  const [analytics, route, pdf, page] = await Promise.all([
    read("lib/analytics.ts"), read("app/api/executive-summary/pdf/route.ts"),
    read("lib/executive-pdf.ts"), read("app/analytics/analytics-sections.tsx")
  ]);
  assert.match(analytics, /comparisonDays/);
  assert.match(analytics, /createdChangePercent/);
  assert.match(route, /requireApiPermission\("analytics:export"\)/);
  assert.match(pdf, /สรุปสถานการณ์เรื่องร้องเรียน/);
  assert.match(page, /ดาวน์โหลดสรุปผู้บริหาร PDF/);
});

test("passcode lifecycle enforces expiry, records use, and supports forced self-service rotation", async () => {
  const [profiles, login, proxy, action] = await Promise.all([
    read("lib/passcode-profiles.ts"), read("app/login/actions.ts"), read("proxy.ts"),
    read("app/account/passcode/actions.ts")
  ]);
  assert.match(profiles, /login_count/);
  assert.match(profiles, /expires_at/);
  assert.match(login, /profile\?\.mustRotate/);
  assert.match(proxy, /session\.mustRotate/);
  assert.match(action, /access\.passcode_rotated/);
  assert.match(action, /must_rotate: false/);
});

test("automated notifications cover failed imports, overdue reports, and failed storage jobs", async () => {
  const [notifications, cron] = await Promise.all([
    read("lib/notifications.ts"), read("app/api/cron/maintenance/route.ts")
  ]);
  assert.match(notifications, /failed-imports/);
  assert.match(notifications, /overdue-reports/);
  assert.match(notifications, /storage-queue/);
  assert.match(cron, /syncOperationalNotifications/);
});

test("performance hardening indexes hot queries and invalidates shared burst caches", async () => {
  const [migration, dashboard, analytics, importConsumer] = await Promise.all([
    read("supabase/migrations/20260715230000_query_performance_hardening.sql"),
    read("lib/dashboard.ts"),
    read("lib/analytics.ts"),
    read("app/api/import/consume/route.ts")
  ]);

  assert.match(migration, /idx_tickets_timestamp_desc/);
  assert.match(migration, /idx_tickets_pending_last_activity/);
  assert.match(migration, /idx_tickets_pending_unassigned/);
  assert.match(migration, /idx_import_batches_completed_latest/);
  assert.match(migration, /idx_report_batches_active_due_date/);
  assert.match(migration, /idx_tickets_timestamp_coordinates/);
  assert.doesNotMatch(migration, /drop table|truncate|delete from|update public/i);
  assert.match(dashboard, /unstable_cache[\s\S]+revalidate: 15/);
  assert.match(analytics, /unstable_cache[\s\S]+revalidate: 60/);
  assert.match(importConsumer, /revalidateTag\(DASHBOARD_CACHE_TAG/);
  assert.match(importConsumer, /revalidateTag\(ANALYTICS_CACHE_TAG/);
});

test("case details render CityData photos inline with a resilient full-size fallback", async () => {
  const [page, photo, config] = await Promise.all([
    read("app/cases/[ticketId]/page.tsx"),
    read("components/case-photo.tsx"),
    read("next.config.mjs")
  ]);

  assert.match(page, /<CasePhoto ticketId=\{data\.ticket\.ticket_id\} photoUrl=\{data\.ticket\.photo_url\}/);
  assert.match(photo, /alt=\{`ภาพประกอบเรื่องร้องเรียน/);
  assert.match(photo, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.match(photo, /เปิดภาพขนาดเต็ม/);
  assert.match(photo, /unoptimized/);
  assert.match(config, /hostname: "storage\.googleapis\.com"/);
  assert.match(config, /traffy_public_bucket\/attachment/);
});
