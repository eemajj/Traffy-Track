import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const reportMigrationUrl = new URL(
  "../supabase/migrations/20260714130000_transactional_report_snapshot.sql",
  import.meta.url
);
const evidenceMigrationUrl = new URL(
  "../supabase/migrations/20260714150000_evidence_versions_outbox.sql",
  import.meta.url
);
const evidencePrivilegeMigrationUrl = new URL(
  "../supabase/migrations/20260714151000_evidence_privilege_hardening.sql",
  import.meta.url
);
const evidenceCorrectnessMigrationUrl = new URL(
  "../supabase/migrations/20260714152000_evidence_review_correctness.sql",
  import.meta.url
);
const evidenceWithdrawMigrationUrl = new URL(
  "../supabase/migrations/20260714154000_evidence_withdraw_correctness.sql",
  import.meta.url
);
const evidenceRouteUrl = new URL(
  "../app/api/report/[batchId]/evidence/route.ts",
  import.meta.url
);
const reportLibraryUrl = new URL("../lib/report.ts", import.meta.url);
const evidenceMutationServiceUrl = new URL("../lib/report/evidence-mutation-service.ts", import.meta.url);
const evidenceTransferOrchestratorUrl = new URL("../lib/report/evidence-transfer-orchestrator.ts", import.meta.url);
const evidenceTransferServiceUrl = new URL("../lib/report/evidence-transfer-service.ts", import.meta.url);
const evidenceHttpHarnessUrl = new URL("../scripts/check-evidence-http.mjs", import.meta.url);
const evidenceRestoreMigrationUrl = new URL(
  "../supabase/migrations/20260714153000_evidence_restore_rpc.sql",
  import.meta.url
);
const operationsRecoveryMigrationUrl = new URL(
  "../supabase/migrations/20260714155000_operations_recovery.sql",
  import.meta.url
);
const operationsAmbiguityFixMigrationUrl = new URL(
  "../supabase/migrations/20260714156000_operations_attempts_ambiguity.sql",
  import.meta.url
);
const importHeartbeatMigrationUrl = new URL(
  "../supabase/migrations/20260714157000_import_heartbeat.sql",
  import.meta.url
);
const analyticsRadiusHotspotsBaseMigrationUrl = new URL(
  "../supabase/migrations/20260714158000_analytics_radius_hotspots.sql",
  import.meta.url
);
const analyticsRadiusHotspotsMigrationUrl = new URL(
  "../supabase/migrations/20260714159000_analytics_legacy_coordinate_compatibility.sql",
  import.meta.url
);
const productionDbContractUrl = new URL(
  "../scripts/check-production-db-contract.mjs",
  import.meta.url
);
const mutatingStagingHarnessUrls = [
  "../scripts/check-phase0-staging.mjs",
  "../scripts/check-report-staging.mjs",
  "../scripts/check-operations-staging.mjs",
  "../scripts/check-evidence-staging.mjs",
  "../scripts/start-staging-dev.mjs"
].map((path) => new URL(path, import.meta.url));

test("report snapshot migration keeps batch, departments, and items in one database function", async () => {
  const sql = await readFile(reportMigrationUrl, "utf8");

  assert.match(sql, /create or replace function public\.create_report_batch_snapshot/);
  assert.match(sql, /lock table public\.tickets in share mode/);
  assert.match(sql, /insert into public\.report_batches/);
  assert.match(sql, /insert into public\.report_batch_departments/);
  assert.match(sql, /insert into public\.report_batch_items/);
  assert.match(sql, /source_import_batch_id/);
  assert.match(sql, /idempotency_key uuid/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /unique index[\s\S]+report_batch_id, dept_name, ticket_id/);
  assert.match(sql, /foreign key \(report_batch_id, dept_name\)/);
  assert.match(sql, /revoke execute[\s\S]+from public, anon, authenticated/);
});

test("evidence migration preserves versions and reconciles storage deletion through a leased outbox", async () => {
  const sql = await readFile(evidenceMigrationUrl, "utf8");

  assert.match(sql, /create table if not exists public\.report_evidence_versions/);
  assert.match(sql, /metadata_source[\s\S]+legacy_unverified/);
  assert.match(sql, /create table if not exists public\.report_evidence_status_events/);
  assert.match(sql, /create table if not exists public\.report_evidence_upload_intents/);
  assert.match(sql, /create table if not exists public\.storage_deletion_outbox/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /lease_token/);
  assert.match(sql, /is_storage_object_referenced/);
  assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant select on public\.report_evidence_versions, public\.report_evidence_status_events to service_role/);
});

test("evidence metadata and lifecycle events cannot be mutated directly by service role", async () => {
  const sql = await readFile(evidencePrivilegeMigrationUrl, "utf8");

  assert.match(sql, /revoke insert, update, delete/);
  assert.match(sql, /report_evidence_versions, public\.report_evidence_status_events/);
  assert.match(sql, /from service_role/);
});

test("evidence review binds decisions to an exact version and completion requires approval", async () => {
  const sql = await readFile(evidenceCorrectnessMigrationUrl, "utf8");

  assert.match(sql, /review_report_evidence_version_v2/);
  assert.match(sql, /p_evidence_version_id uuid/);
  assert.match(sql, /raise sqlstate 'PT409'/);
  assert.match(sql, /char_length\(v_note\) < 5/);
  assert.match(sql, /report_batch_evidence_rollup/);
  assert.match(sql, /version\.review_status = 'approved'/);
  assert.match(sql, /completion_semantics[\s\S]+approved_v1/);
  assert.match(sql, /v_idempotent boolean := false/);
  assert.match(sql, /if v_intent\.status = 'attached'[\s\S]+v_idempotent := true;[\s\S]+else[\s\S]+update public\.report_batch_departments/);
});

test("evidence withdrawal binds destructive action to an exact version and supports safe retries", async () => {
  const sql = await readFile(evidenceWithdrawMigrationUrl, "utf8");

  assert.match(sql, /withdraw_report_evidence_v2/);
  assert.match(sql, /p_evidence_version_id uuid/);
  assert.match(sql, /current_evidence_version_id <> p_evidence_version_id/);
  assert.match(sql, /raise sqlstate 'PT409'/);
  assert.match(sql, /char_length\(v_reason\) < 5/);
  assert.match(sql, /'idempotent', true/);
  assert.match(sql, /revoke execute on function public\.review_report_evidence_version\(/);
  assert.match(sql, /revoke execute on function public\.withdraw_report_evidence\(/);
});

test("evidence withdrawal has a deletion grace period and exact-version undo", async () => {
  const [sql, route, checklist] = await Promise.all([
    readFile(new URL("../supabase/migrations/20260715120000_evidence_withdraw_grace_undo.sql", import.meta.url), "utf8"),
    readFile(new URL("../app/api/report/[batchId]/evidence/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/report/[batchId]/report-department-checklist.tsx", import.meta.url), "utf8")
  ]);

  assert.match(sql, /interval '15 minutes'/);
  assert.match(sql, /create or replace function public\.undo_report_evidence_withdrawal/);
  assert.match(sql, /v_outbox\.status <> 'pending'/);
  assert.match(sql, /delete from public\.storage_deletion_outbox/);
  assert.match(route, /evidence\.withdrawal_undone/);
  assert.match(checklist, /Undo การถอน/);
});

test("evidence API validates version ids and reports auto-approval from the requested action only", async () => {
  const [route, reportLibrary, evidenceMutationService, evidenceTransferOrchestrator, evidenceTransferService] = await Promise.all([
    readFile(evidenceRouteUrl, "utf8"),
    readFile(reportLibraryUrl, "utf8"),
    readFile(evidenceMutationServiceUrl, "utf8"),
    readFile(evidenceTransferOrchestratorUrl, "utf8"),
    readFile(evidenceTransferServiceUrl, "utf8")
  ]);

  assert.match(route, /isEvidenceVersionId\(evidenceVersionId\)/);
  assert.match(route, /let didAutoApprove = false/);
  assert.match(route, /autoApproved: didAutoApprove/);
  assert.match(route, /evidence\.upload_completion_retried/);
  assert.match(route, /evidence\.withdrawal_retried/);
  assert.match(reportLibrary, /evidence-transfer-service/);
  assert.match(evidenceTransferOrchestrator, /loadProjection[\s\S]+isCurrentVersion:/);
  assert.match(evidenceTransferService, /attach_report_evidence_version/);
  assert.match(reportLibrary, /evidence-mutation-service/);
  assert.match(evidenceMutationService, /withdraw_report_evidence_v2/);
});

test("evidence HTTP QA harness is staging-only, covers release blockers, and always cleans up", async () => {
  const script = await readFile(evidenceHttpHarnessUrl, "utf8");

  assert.match(script, /Evidence HTTP QA refuses to run against the Production application host/);
  assert.match(script, /QA_VERCEL_DEPLOYMENT/);
  assert.match(script, /"vercel", "curl"/);
  assert.match(script, /projectRef !== STAGING_PROJECT_REF/);
  assert.match(script, /unauthenticated401/);
  assert.match(script, /operatorAutoApprove403/);
  assert.match(script, /malformedUuid400/);
  assert.match(script, /staleReview409/);
  assert.match(script, /autoApprove/);
  assert.match(script, /idempotentCompletionRetry/);
  assert.match(script, /finally \{\s*await cleanup\(\)/);
});

test("immutable evidence restore is transactional, empty-target only, and service-role scoped", async () => {
  const sql = await readFile(evidenceRestoreMigrationUrl, "utf8");

  assert.match(sql, /create or replace function public\.restore_report_evidence_snapshot/);
  assert.match(sql, /security definer/);
  assert.match(sql, /requires empty evidence history tables/);
  assert.match(sql, /insert into public\.report_evidence_versions/);
  assert.match(sql, /insert into public\.report_evidence_status_events/);
  assert.match(sql, /from public\.storage_deletion_outbox[\s\S]+for update/);
  assert.match(sql, /job\.status = 'processing'/);
  assert.match(sql, /delete from public\.storage_deletion_outbox/);
  assert.match(sql, /pg_get_serial_sequence\('public\.report_evidence_status_events', 'id'\)/);
  assert.match(sql, /revoke execute[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute[\s\S]+to service_role/);
});

test("operations recovery dead-letters storage jobs and atomically releases stale imports", async () => {
  const sql = await readFile(operationsRecoveryMigrationUrl, "utf8");

  assert.match(sql, /status in \('pending', 'processing', 'completed', 'failed', 'dead'\)/);
  assert.match(sql, /job\.attempts < 10/);
  assert.match(sql, /case when attempts >= 10 then 'dead'/);
  assert.match(sql, /reset_storage_deletion_retry_on_new_request/);
  assert.match(sql, /create or replace function public\.recover_stale_import_jobs/);
  assert.match(sql, /imported_at < now\(\) - interval '2 hours'/);
  assert.match(sql, /'import\.stale_recovered'/);
  assert.match(sql, /create or replace function public\.apply_import_batch/);
  assert.match(sql, /where id = p_import_batch_id and status = 'running'[\s\S]+for update/);
  assert.match(sql, /create or replace function public\.operations_health_snapshot/);
  assert.match(sql, /'staleLeases'/);
  assert.match(sql, /'oldestActionableAt'/);
});

test("operations claim forward-fix prevents output parameters from shadowing outbox columns", async () => {
  const sql = await readFile(operationsAmbiguityFixMigrationUrl, "utf8");

  assert.match(sql, /#variable_conflict use_column/);
  assert.match(sql, /update public\.storage_deletion_outbox as exhausted/);
  assert.match(sql, /where exhausted\.attempts >= 10/);
  assert.match(sql, /returning job\.id, job\.bucket, job\.object_path, job\.lease_token, job\.attempts/);
  assert.match(sql, /revoke execute[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute[\s\S]+to service_role/);
});

test("import heartbeat keeps healthy long-running work out of stale recovery", async () => {
  const sql = await readFile(importHeartbeatMigrationUrl, "utf8");

  assert.match(sql, /add column if not exists heartbeat_at timestamptz/);
  assert.match(sql, /create or replace function public\.heartbeat_import_batch/);
  assert.match(sql, /where id = p_import_batch_id and status = 'running'/);
  assert.match(sql, /coalesce\(heartbeat_at, imported_at\) < now\(\) - interval '2 hours'/);
  assert.match(sql, /'staleQueued'/);
  assert.match(sql, /'staleRunning'/);
  assert.match(sql, /'oldestHeartbeatAt'/);
  assert.match(sql, /revoke execute[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute[\s\S]+to service_role/);
});

test("analytics hotspots use real metre distances, unique assignment, and null-safe pending counts", async () => {
  const sql = (await Promise.all([
    readFile(analyticsRadiusHotspotsBaseMigrationUrl, "utf8"),
    readFile(analyticsRadiusHotspotsMigrationUrl, "utf8")
  ])).join("\n");

  assert.match(sql, /create extension if not exists postgis with schema extensions/);
  assert.match(sql, /create or replace function public\.analytics_radius_hotspots/);
  assert.match(sql, /st_transform[\s\S]+32647/);
  assert.match(sql, /when ticket\.lat between 90 and 180 and ticket\.lng between -90 and 90/);
  assert.match(sql, /raw\.lat between 13\.3 and 14\.2/);
  assert.match(sql, /raw\.lng between 100\.2 and 101\.1/);
  assert.match(sql, /st_dwithin/);
  assert.match(sql, /2\.0 \* radius_m/);
  assert.match(sql, /selected_geometries/);
  assert.match(sql, /row_number\(\) over[\s\S]+partition by point\.ticket_id/);
  assert.match(sql, /where assignment\.assignment_rank = 1/);
  assert.match(sql, /assignment\.state is null[\s\S]+assignment\.state not in/);
  assert.match(sql, /'closedCount'/);
  assert.match(sql, /'sharePercent'/);
  assert.match(sql, /revoke execute[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute[\s\S]+to service_role/);
});

test("production DB contract gate refuses the wrong target and verifies the analytics release contract", async () => {
  const script = await readFile(productionDbContractUrl, "utf8");

  assert.match(script, /PRODUCTION_PREFLIGHT_CONFIRM/);
  assert.match(script, /zllbfazkhrvlfutehkyh/);
  assert.match(script, /refuses Supabase target/);
  assert.match(script, /analytics_overview/);
  assert.match(script, /analytics_radius_hotspots/);
  assert.match(script, /JSON\.stringify\(first\.data\) === JSON\.stringify\(second\.data\)/);
  assert.match(script, /Anonymous role unexpectedly executed/);
  assert.match(script, /operations_health_snapshot/);
});

test("mutating staging harnesses are pinned to the exact Staging project", async () => {
  const scripts = await Promise.all(mutatingStagingHarnessUrls.map((url) => readFile(url, "utf8")));

  for (const script of scripts) {
    assert.match(script, /STAGING_PROJECT_REF = "pyyoysdcedaskohiocdg"/);
    assert.match(script, /projectRef !== STAGING_PROJECT_REF/);
  }
});
