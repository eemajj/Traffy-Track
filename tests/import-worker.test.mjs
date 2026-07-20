import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260715110000_import_durable_consumer.sql",
  import.meta.url
);
const importRouteUrl = new URL("../app/api/import/route.ts", import.meta.url);
const cronRouteUrl = new URL("../app/api/cron/import/route.ts", import.meta.url);
const processUrl = new URL("../lib/import/process.ts", import.meta.url);
const jobServiceUrl = new URL("../lib/import/job-service.ts", import.meta.url);
const applyServiceUrl = new URL("../lib/import/apply-service.ts", import.meta.url);
const workerUrl = new URL("../lib/import/worker.ts", import.meta.url);
const largeFileMigrationUrl = new URL(
  "../supabase/migrations/20260719090000_import_large_file_timeout.sql",
  import.meta.url
);
const largeFileStagingQaUrl = new URL(
  "../scripts/check-import-large-file-staging.mjs",
  import.meta.url
);
const stagedPipelineMigrationUrl = new URL(
  "../supabase/migrations/20260719120000_import_staged_pipeline_v2.sql",
  import.meta.url
);
const stagingServiceUrl = new URL("../lib/import/staging-service.ts", import.meta.url);
const stagedPipelineQaUrl = new URL(
  "../scripts/check-import-pipeline-v2-staging.mjs",
  import.meta.url
);

test("durable import claim is atomic, lease-bound, and stale-recoverable", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /add column if not exists storage_path text/);
  assert.match(sql, /add column if not exists attempt_count integer not null default 0/);
  assert.match(sql, /add column if not exists lease_token uuid/);
  assert.match(sql, /create unique index if not exists idx_import_batches_storage_path/);
  assert.match(sql, /create or replace function public\.claim_import_batches/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /attempt_count = batch\.attempt_count \+ 1/);
  assert.match(sql, /lease_token = gen_random_uuid\(\)/);
  assert.match(sql, /locked_until < now\(\)/);
  assert.match(sql, /batch\.attempt_count < batch\.max_attempts/);
  assert.match(sql, /power\(2, greatest/);
  assert.match(sql, /'importBatchIds'/);
  assert.match(sql, /'import\.stale_recovered'/);
});

test("Pipeline V2 Staging QA uses a large isolated CSV and proves both phases with cleanup", async () => {
  const source = await readFile(stagedPipelineQaUrl, "utf8");

  assert.match(source, /STAGING_PROJECT_REF = "pyyoysdcedaskohiocdg"/);
  assert.match(source, /parsed\.data\.length >= 10_000/);
  assert.match(source, /ticketPrefix = `q\$\{runId\.slice\(0, 8\)\}-`/);
  assert.match(source, /api\("\/api\/import\/consume"/);
  assert.match(source, /canonicalBeforeFinalize === 0/);
  assert.match(source, /runFinalizeRollbackDrill/);
  assert.match(source, /corrupt stage unexpectedly finalized/);
  assert.match(source, /failed finalize partially wrote a ticket/);
  assert.match(source, /terminal release retained ticket stage/);
  assert.match(source, /processing_phase === "finalizing"/);
  assert.match(source, /attempt_count === 0/);
  assert.match(source, /finalizedWorker\.worker\?\.completed === 1/);
  assert.match(source, /finally[\s\S]+delete\(\)\.like\("ticket_id"/);
  assert.match(source, /Pipeline V2 QA cleanup failed/);
});

test("heartbeat and final apply reject stale import workers by lease token", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create or replace function public\.heartbeat_claimed_import_batch/);
  assert.match(sql, /and lease_token = p_lease_token[\s\S]+and locked_until >= now\(\)/);
  assert.match(sql, /create or replace function public\.apply_claimed_import_batch/);
  assert.match(sql, /where id = p_import_batch_id[\s\S]+and lease_token = p_lease_token[\s\S]+for update/);
  assert.match(sql, /insert into public\.ticket_history[\s\S]+update public\.import_batches/);
  assert.match(sql, /status = 'completed'[\s\S]+lease_token = null/);
  assert.match(sql, /revoke execute[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute[\s\S]+to service_role/);
});

test("claim release retries with backoff and stops at max attempts", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create or replace function public\.release_import_batch_claim/);
  assert.match(sql, /v_retry := p_retryable and v_batch\.attempt_count < v_batch\.max_attempts/);
  assert.match(sql, /status = case when v_retry then 'queued' else 'failed' end/);
  assert.match(sql, /next_attempt_at = case[\s\S]+make_interval/);
  assert.match(sql, /'reason', 'lease_lost'/);
});

test("upload request only persists a durable job and does not depend on waitUntil", async () => {
  const source = await readFile(importRouteUrl, "utf8");

  assert.doesNotMatch(source, /@vercel\/functions|waitUntil/);
  assert.match(source, /storagePath: payload\.path/);
  assert.match(source, /action: "import\.queued"/);
  assert.match(source, /status: 202/);
});

test("duplicate enqueue for one storage object returns the original batch", async () => {
  const source = await readFile(jobServiceUrl, "utf8");

  assert.match(source, /if \(input\.storagePath\)/);
  assert.match(source, /source_storage_path_v2: input\.storagePath/);
  assert.match(source, /pipeline_version: input\.storagePath \? 2 : 1/);
  assert.match(source, /\.eq\("source_storage_path_v2", input\.storagePath\)/);
  assert.match(source, /return mapImportBatchRow\(existingResult\.data/);
});

test("cron consumer is authenticated and executes one bounded durable claim", async () => {
  const [route, worker] = await Promise.all([
    readFile(cronRouteUrl, "utf8"),
    readFile(workerUrl, "utf8")
  ]);

  assert.match(route, /isCronAuthorizationValid/);
  assert.match(route, /hasSupabaseAdminEnv/);
  assert.match(route, /runDurableImportWorker\(1\)/);
  assert.match(route, /export const maxDuration = 60/);
  assert.match(worker, /rpc\("claim_import_batches"/);
  assert.match(worker, /rpc\("claim_import_batches_v2"/);
  assert.match(worker, /"release_import_batch_claim"/);
  assert.match(worker, /"import\.retry_scheduled"/);
  assert.match(worker, /deleteImportSourceIfTerminal/);
});

test("V2 stages typed rows under an exact lease before one atomic final merge", async () => {
  const [sql, service, process, worker] = await Promise.all([
    readFile(stagedPipelineMigrationUrl, "utf8"),
    readFile(stagingServiceUrl, "utf8"),
    readFile(processUrl, "utf8"),
    readFile(workerUrl, "utf8")
  ]);

  assert.match(sql, /create table if not exists public\.import_ticket_stage/);
  assert.match(sql, /create table if not exists public\.import_history_stage/);
  assert.match(sql, /create or replace function public\.claim_import_batches_v2/);
  assert.match(sql, /pipeline_version = 2[\s\S]+for update skip locked/);
  assert.match(sql, /create or replace function public\.reset_claimed_import_stage_v2/);
  assert.match(sql, /create or replace function public\.stage_claimed_import_rows_v2/);
  assert.match(sql, /lease_token = p_lease_token and locked_until >= now\(\)/);
  assert.match(sql, /on conflict \(import_batch_id, ticket_id\) do update/);
  assert.match(sql, /create or replace function public\.continue_claimed_import_batch_v2/);
  assert.match(sql, /processing_phase = 'finalizing', status = 'queued'/);
  assert.match(sql, /attempt_count = greatest\(attempt_count - 1, 0\)/);
  assert.match(sql, /create or replace function public\.finalize_staged_import_batch_v2/);
  assert.match(sql, /v_staged_tickets <> v_expected_tickets or v_staged_history <> v_expected_history/);
  assert.match(sql, /insert into public\.tickets[\s\S]+insert into public\.ticket_history[\s\S]+status = 'completed'[\s\S]+delete from public\.import_ticket_stage/);
  assert.match(sql, /create or replace function public\.release_import_batch_claim_v2[\s\S]+v_result ->> 'status' = 'failed'[\s\S]+delete from public\.import_ticket_stage/);
  assert.match(sql, /pipeline_version = 1 and batch\.storage_path is null/);
  assert.match(sql, /revoke execute[\s\S]+from public, anon, authenticated/);

  assert.match(service, /STAGE_TICKET_CHUNK_SIZE = 750/);
  assert.match(service, /rpc\("reset_claimed_import_stage_v2"/);
  assert.match(service, /rpc\("stage_claimed_import_rows_v2"/);
  assert.match(service, /rpc\("continue_claimed_import_batch_v2"/);
  assert.match(service, /rpc\("finalize_staged_import_batch_v2"/);
  assert.match(process, /options\?\.apply \|\| applyImportBatchTransaction/);
  assert.match(worker, /processing_phase === "finalizing"/);
  assert.match(worker, /stageImportBatchTransaction/);
  assert.match(worker, /job\.pipeline_version === 2 \? "release_import_batch_claim_v2"/);
});

test("authenticated browser consumer starts durable work immediately with daily cron recovery", async () => {
  const [consumer, client, vercel] = await Promise.all([
    readFile(new URL("../app/api/import/consume/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/import/use-import-controller.ts", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8")
  ]);

  assert.match(consumer, /requireApiSession/);
  assert.match(consumer, /runDurableImportWorker\(1\)/);
  assert.match(consumer, /maxDuration = 60/);
  assert.match(client, /fetch\("\/api\/import\/consume", \{ method: "POST" \}\)/);
  assert.match(vercel, /"path": "\/api\/cron\/import"/);
  assert.match(vercel, /"schedule": "5 18 \* \* \*"/);
});

test("claimed processing heartbeats and atomically applies with the same lease", async () => {
  const [process, jobService, applyService] = await Promise.all([
    readFile(processUrl, "utf8"),
    readFile(jobServiceUrl, "utf8"),
    readFile(applyServiceUrl, "utf8")
  ]);

  assert.match(jobService, /rpc\("heartbeat_claimed_import_batch"/);
  assert.match(jobService, /p_lease_token: leaseToken/);
  assert.match(applyService, /rpc\("apply_claimed_import_batch"/);
  assert.match(applyService, /p_lease_token: input\.leaseToken/);
  assert.match(process, /if \(importBatchId && !options\?\.leaseToken\)/);
  assert.match(process, /applyImportBatchTransaction/);
  assert.match(process, /SELECT_CHUNK_CONCURRENCY = 4/);
  assert.match(process, /chunkArray\(ticketIdChunks, SELECT_CHUNK_CONCURRENCY\)/);
  assert.match(process, /Promise\.all\(chunkGroup\.map/);
});

test("large import apply has a bounded timeout and keeps the prior retry error visible", async () => {
  const sql = await readFile(largeFileMigrationUrl, "utf8");

  assert.match(sql, /alter function public\.apply_claimed_import_batch[\s\S]+set statement_timeout = '45s'/);
  assert.match(sql, /create or replace function public\.preserve_import_retry_error/);
  assert.match(sql, /old\.status = 'queued'[\s\S]+new\.status = 'running'/);
  assert.match(sql, /new\.error_message := old\.error_message/);
  assert.match(sql, /revoke execute[\s\S]+from public, anon, authenticated/);
});

test("large import Staging QA is target-pinned and verifies claim-to-completion semantics", async () => {
  const source = await readFile(largeFileStagingQaUrl, "utf8");

  assert.match(source, /STAGING_PROJECT_REF = "pyyoysdcedaskohiocdg"/);
  assert.match(source, /Staging import queue must be empty/);
  assert.match(source, /previous statement timeout/);
  assert.match(source, /rpc\("claim_import_batches"/);
  assert.match(source, /rpc\("apply_claimed_import_batch"/);
  assert.match(source, /anon\.rpc\("preserve_import_retry_error"\)/);
  assert.match(source, /finally[\s\S]+delete\(\)\.eq\("id", importBatchId\)/);
});
