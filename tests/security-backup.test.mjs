import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260715100000_security_audit_login_rate_limit.sql",
  import.meta.url
);
const loginUrl = new URL("../app/login/actions.ts", import.meta.url);
const auditUrl = new URL("../lib/audit.ts", import.meta.url);
const backupRouteUrl = new URL("../app/api/admin/backup/export/route.ts", import.meta.url);
const preflightUrl = new URL("../scripts/production-preflight-backup.mjs", import.meta.url);
const restoreUrl = new URL("../scripts/restore-backup.mjs", import.meta.url);
const exportRouteUrls = [
  "../app/api/report/[batchId]/export/route.ts",
  "../app/api/report/[batchId]/export-pdf/route.ts",
  "../app/api/report/[batchId]/export-all/route.ts"
].map((value) => new URL(value, import.meta.url));
const reportExportAuditUrl = new URL("../lib/report/export-audit.ts", import.meta.url);

test("login throttling is database-backed, atomic, and service-role-only", async () => {
  const [migration, login, audit] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(loginUrl, "utf8"),
    readFile(auditUrl, "utf8")
  ]);

  assert.match(migration, /create table if not exists public\.login_rate_limits/);
  assert.match(migration, /create or replace function public\.consume_login_attempt/);
  assert.match(migration, /for update/);
  assert.match(migration, /v_attempts >= 5/);
  assert.match(migration, /interval '15 minutes'/);
  assert.match(migration, /revoke execute[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]+to service_role/);
  assert.match(audit, /rpc\("consume_login_attempt"/);
  assert.match(login, /createHmac\("sha256", secret\)/);
  assert.match(login, /auth\.login_failed/);
  assert.match(login, /auth\.login_succeeded/);
  assert.match(login, /auth\.login_rate_limited/);
  assert.doesNotMatch(login, /metadata:[\s\S]{0,100}passcode/);
});

test("report creation audit is enforced at the database boundary", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /create trigger audit_report_batch_created/);
  assert.match(migration, /after insert on public\.report_batches/);
  assert.match(migration, /'report\.created'/);
  assert.match(migration, /'auditSource', 'database_trigger'/);
});

test("backup transport emits a verifiable identity, checksum, and retention policy", async () => {
  const [route, preflight, transport, migration, timeoutMigration, admin] = await Promise.all([
    readFile(backupRouteUrl, "utf8"),
    readFile(preflightUrl, "utf8"),
    readFile(new URL("../scripts/lib/backup-transport.mjs", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260715130000_consistent_backup_snapshot.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260715131000_backup_snapshot_timeout.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin/runtime.ts", import.meta.url), "utf8")
  ]);

  assert.match(route, /createHash\("sha256"\)\.update\(backup\.buffer\)/);
  assert.match(route, /"X-Backup-Id"/);
  assert.match(route, /"X-Backup-SHA256"/);
  assert.match(route, /"X-Backup-Retain-Until"/);
  assert.match(route, /retentionDays: BACKUP_RETENTION_DAYS/);
  assert.match(preflight, /responseSha256 !== plaintextSha256/);
  assert.match(preflight, /tf-backup-artifact-v1/);
  assert.match(preflight, /BACKUP_ENCRYPTION_PASSPHRASE/);
  assert.match(preflight, /BACKUP_ENCRYPTION_PASSPHRASE_FILE/);
  assert.match(preflight, /PRODUCTION_ALLOW_LEGACY_BACKUP_HEADERS/);
  assert.match(transport, /aes-256-gcm/);
  assert.match(preflight, /mode: 0o600/);
  assert.match(migration, /create or replace function public\.create_system_backup_snapshot/);
  assert.match(migration, /select jsonb_build_object/);
  assert.match(migration, /'audit_events'/);
  assert.match(timeoutMigration, /alter function public\.create_system_backup_snapshot\(\)/);
  assert.match(timeoutMigration, /statement_timeout = '120s'/);
  assert.match(admin, /rpc\("create_system_backup_snapshot"\)/);
  assert.match(admin, /postgres-single-statement-mvcc-v1/);
});

test("restore authenticates encrypted artifacts and requires explicit break-glass for old backups", async () => {
  const restore = await readFile(restoreUrl, "utf8");

  assert.match(restore, /metadata\.artifactSha256 !== artifactSha256/);
  assert.match(restore, /metadata\.plaintextSha256 !== plaintextSha256/);
  assert.match(restore, /decipher\.setAuthTag/);
  assert.match(restore, /--allow-unverified-artifact/);
  assert.match(restore, /Refusing an unverified restore/);
  assert.match(restore, /backup\.restore_previewed/);
  assert.match(restore, /backup\.restored/);
  assert.match(restore, /backup\.restore_failed/);
  assert.match(restore, /ticket_assignment_events/);
  assert.match(restore, /report_workflow_events/);
  assert.match(restore, /restoreOperationalHistory/);
  assert.match(restore, /restore_operational_history_snapshot/);
  assert.match(restore, /original IDs/);
});

test("all report export formats audit success and privileged failures", async () => {
  const [routes, audit] = await Promise.all([
    Promise.all(exportRouteUrls.map((url) => readFile(url, "utf8"))),
    readFile(reportExportAuditUrl, "utf8")
  ]);

  for (const route of routes) {
    assert.match(route, /buildReportExportSuccessAudit/);
    assert.match(route, /buildReportExportFailureAudit/);
  }

  assert.match(audit, /action: "report\.exported"/);
  assert.match(audit, /action: "report\.export_failed"/);
  assert.match(audit, /outcome: "failure"/);
});
