import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "pyyoysdcedaskohiocdg";
const sourceFile = process.argv[2];
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";
const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const sessionSecret = process.env.APP_SESSION_SECRET || "";
const cookieName = process.env.APP_AUTH_COOKIE || "citydata-passcode";

if (!sourceFile) throw new Error("Usage: node scripts/check-import-pipeline-v2-staging.mjs <large.csv>");
if (!supabaseUrl.includes(STAGING_PROJECT_REF)) throw new Error("Pipeline V2 QA is restricted to Staging");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
if (Buffer.byteLength(sessionSecret) < 32) throw new Error("APP_SESSION_SECRET must be at least 32 bytes");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const runId = randomUUID();
// Keep the synthetic prefix short enough that 500-id PostgREST filters stay
// below proxy URL limits while remaining unique inside this isolated run.
const ticketPrefix = `q${runId.slice(0, 8)}-`;
const filename = `__pipeline-v2-${runId}.csv`;
const storagePath = `incoming/${filename}`;
let importBatchId = null;
let failureBatchId = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sessionCookie() {
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const payload = `v2.${expiresAt}.admin`;
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${cookieName}=${payload}.${signature}`;
}

async function api(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: { cookie: sessionCookie(), ...(init.headers || {}) }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${payload?.error || "unknown error"}`);
  return payload;
}

async function count(table, configure) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  query = configure(query);
  const result = await query;
  if (result.error) throw result.error;
  return result.count || 0;
}

const durations = {};

async function runFinalizeRollbackDrill() {
  const failureTicketId = `qfail-${runId}`;
  const inserted = await supabase.from("import_batches").insert({
    filename: `__pipeline-v2-failure-${runId}.csv`,
    source_storage_path_v2: `incoming/__pipeline-v2-failure-${runId}.csv`,
    pipeline_version: 2,
    processing_phase: "staging",
    status: "queued",
    max_attempts: 1
  }).select("id").single();
  if (inserted.error) throw inserted.error;
  failureBatchId = inserted.data.id;

  const stagingClaim = await supabase.rpc("claim_import_batches_v2", { p_limit: 1, p_lease_seconds: 120 });
  if (stagingClaim.error) throw stagingClaim.error;
  const stagingLease = stagingClaim.data?.[0]?.lease_token;
  assert(stagingClaim.data?.[0]?.id === failureBatchId && stagingLease, "failure drill staging claim failed");

  const reset = await supabase.rpc("reset_claimed_import_stage_v2", {
    p_import_batch_id: failureBatchId,
    p_lease_token: stagingLease,
    p_lease_seconds: 120
  });
  if (reset.error) throw reset.error;
  const staged = await supabase.rpc("stage_claimed_import_rows_v2", {
    p_import_batch_id: failureBatchId,
    p_lease_token: stagingLease,
    p_tickets: [{ ticket_id: failureTicketId, org_list: [], dept_list: [] }],
    p_history: [{ ticket_id: failureTicketId, changed_field: "new_ticket", old_value: null, new_value: "QA" }],
    p_lease_seconds: 120
  });
  if (staged.error) throw staged.error;
  const continued = await supabase.rpc("continue_claimed_import_batch_v2", {
    p_import_batch_id: failureBatchId,
    p_lease_token: stagingLease,
    p_total_rows: 1,
    p_processed_rows: 1,
    p_duplicate_rows: 0,
    p_new_tickets: 1,
    p_reopened_tickets: 0,
    p_changed_tickets: 0,
    p_unchanged_tickets: 0,
    p_changed_fields: 0,
    p_expected_tickets: 1,
    p_expected_history: 1
  });
  if (continued.error) throw continued.error;

  const finalClaim = await supabase.rpc("claim_import_batches_v2", { p_limit: 1, p_lease_seconds: 120 });
  if (finalClaim.error) throw finalClaim.error;
  const finalLease = finalClaim.data?.[0]?.lease_token;
  assert(finalClaim.data?.[0]?.id === failureBatchId && finalLease, "failure drill final claim failed");
  const corrupted = await supabase.from("import_ticket_stage").delete()
    .eq("import_batch_id", failureBatchId).eq("ticket_id", failureTicketId);
  if (corrupted.error) throw corrupted.error;

  const finalized = await supabase.rpc("finalize_staged_import_batch_v2", {
    p_import_batch_id: failureBatchId,
    p_lease_token: finalLease
  });
  assert(Boolean(finalized.error), "corrupt stage unexpectedly finalized");
  assert(await count("tickets", (query) => query.eq("ticket_id", failureTicketId)) === 0, "failed finalize partially wrote a ticket");
  assert(await count("ticket_history", (query) => query.eq("import_batch_id", failureBatchId)) === 0, "failed finalize partially wrote history");

  const released = await supabase.rpc("release_import_batch_claim_v2", {
    p_import_batch_id: failureBatchId,
    p_lease_token: finalLease,
    p_error_message: "intentional Pipeline V2 rollback drill",
    p_retryable: false
  });
  if (released.error) throw released.error;
  assert(released.data?.status === "failed", "failure drill did not become terminal");
  assert(await count("import_ticket_stage", (query) => query.eq("import_batch_id", failureBatchId)) === 0, "terminal release retained ticket stage");
  assert(await count("import_history_stage", (query) => query.eq("import_batch_id", failureBatchId)) === 0, "terminal release retained history stage");

  await supabase.from("import_batches").delete().eq("id", failureBatchId);
  failureBatchId = null;
}

try {
  const active = await supabase.from("import_batches").select("id").in("status", ["queued", "running"]);
  if (active.error) throw active.error;
  assert(active.data.length === 0, "Staging import queue must be empty before Pipeline V2 QA");
  await runFinalizeRollbackDrill();

  const sourceText = await readFile(sourceFile, "utf8");
  const parsed = Papa.parse(sourceText, { header: true, skipEmptyLines: "greedy" });
  if (parsed.errors.length > 0) throw new Error(`Source CSV parse failed: ${parsed.errors[0].message}`);
  assert(parsed.data.length >= 10_000, "Pipeline V2 QA requires at least 10,000 source rows");
  for (let index = 0; index < parsed.data.length; index += 1) {
    parsed.data[index].ticket_id = `${ticketPrefix}${parsed.data[index].ticket_id || index + 1}`;
  }
  const qaCsv = Papa.unparse(parsed.data, { columns: parsed.meta.fields });

  const uploaded = await supabase.storage.from("traffy-track-imports").upload(
    storagePath,
    new Blob([qaCsv], { type: "text/csv" }),
    { contentType: "text/csv", upsert: false }
  );
  if (uploaded.error) throw uploaded.error;

  const queued = await api("/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: storagePath, filename })
  });
  importBatchId = queued.importBatchId;
  assert(queued.status === "queued", "V2 enqueue did not return queued status");
  assert(queued.processingPhase === "staging", "V2 enqueue did not start in staging phase");

  const stageStartedAt = Date.now();
  const stagedWorker = await api("/api/import/consume", { method: "POST" });
  durations.stagingMs = Date.now() - stageStartedAt;
  assert(
    stagedWorker.worker?.staged === 1,
    `first worker invocation did not stage one V2 batch: ${JSON.stringify(stagedWorker.worker)}`
  );

  const stagedBatch = await supabase.from("import_batches")
    .select("status,processing_phase,total_rows,processed_rows,new_tickets,changed_tickets,changed_fields,attempt_count")
    .eq("id", importBatchId).single();
  if (stagedBatch.error) throw stagedBatch.error;
  assert(stagedBatch.data.status === "queued", "staged batch was not yielded back to the queue");
  assert(stagedBatch.data.processing_phase === "finalizing", "staged batch did not advance to finalizing");
  assert(stagedBatch.data.attempt_count === 0, "planned phase continuation consumed retry budget");

  const canonicalBeforeFinalize = await count("tickets", (query) => query.like("ticket_id", `${ticketPrefix}%`));
  assert(canonicalBeforeFinalize === 0, "staging mutated canonical tickets before finalization");
  const stagedTickets = await count("import_ticket_stage", (query) => query.eq("import_batch_id", importBatchId));
  const stagedHistory = await count("import_history_stage", (query) => query.eq("import_batch_id", importBatchId));
  assert(stagedTickets === stagedBatch.data.new_tickets + stagedBatch.data.changed_tickets, "staged ticket count mismatch");
  assert(stagedHistory === stagedBatch.data.new_tickets + stagedBatch.data.changed_fields, "staged history count mismatch");

  const finalizeStartedAt = Date.now();
  const finalizedWorker = await api("/api/import/consume", { method: "POST" });
  durations.finalizingMs = Date.now() - finalizeStartedAt;
  assert(
    finalizedWorker.worker?.completed === 1,
    `second worker invocation did not finalize one V2 batch: ${JSON.stringify(finalizedWorker.worker)}`
  );

  const completed = await supabase.from("import_batches")
    .select("status,processing_phase,total_rows,processed_rows,new_tickets,changed_tickets,changed_fields")
    .eq("id", importBatchId).single();
  if (completed.error) throw completed.error;
  assert(completed.data.status === "completed", "V2 batch did not complete");
  assert(await count("tickets", (query) => query.like("ticket_id", `${ticketPrefix}%`)) === completed.data.processed_rows, "canonical ticket count differs from processed rows");
  assert(await count("ticket_history", (query) => query.eq("import_batch_id", importBatchId)) === completed.data.new_tickets + completed.data.changed_fields, "history count differs from summary");
  assert(await count("import_ticket_stage", (query) => query.eq("import_batch_id", importBatchId)) === 0, "ticket stage was not cleared");
  assert(await count("import_history_stage", (query) => query.eq("import_batch_id", importBatchId)) === 0, "history stage was not cleared");
  const sourceAfter = await supabase.storage.from("traffy-track-imports").list("incoming", { search: filename });
  if (sourceAfter.error) throw sourceAfter.error;
  assert(sourceAfter.data.length === 0, "terminal worker did not remove the source object");

  console.log(JSON.stringify({
    projectRef: STAGING_PROJECT_REF,
    sourceRows: parsed.data.length,
    sourceBytes: Buffer.byteLength(qaCsv),
    importBatchId,
    summary: completed.data,
    durations,
    checks: {
      canonicalUntouchedDuringStaging: "passed",
      plannedContinuationPreservedAttempts: "passed",
      atomicFinalizeCompleted: "passed",
      stageCleared: "passed",
      sourceCleared: "passed",
      finalizeRollbackAndTerminalCleanup: "passed"
    }
  }, null, 2));
} finally {
  if (importBatchId) {
    await supabase.from("ticket_history").delete().eq("import_batch_id", importBatchId);
    await supabase.from("tickets").delete().like("ticket_id", `${ticketPrefix}%`);
    await supabase.from("import_history_stage").delete().eq("import_batch_id", importBatchId);
    await supabase.from("import_ticket_stage").delete().eq("import_batch_id", importBatchId);
    await supabase.from("import_batches").delete().eq("id", importBatchId);
  }
  if (failureBatchId) {
    await supabase.from("ticket_history").delete().eq("import_batch_id", failureBatchId);
    await supabase.from("tickets").delete().eq("ticket_id", `qfail-${runId}`);
    await supabase.from("import_history_stage").delete().eq("import_batch_id", failureBatchId);
    await supabase.from("import_ticket_stage").delete().eq("import_batch_id", failureBatchId);
    await supabase.from("import_batches").delete().eq("id", failureBatchId);
  }
  await supabase.storage.from("traffy-track-imports").remove([storagePath]);

  const remainingTickets = await count("tickets", (query) => query.like("ticket_id", `${ticketPrefix}%`));
  const remainingBatch = importBatchId
    ? await count("import_batches", (query) => query.eq("id", importBatchId))
    : 0;
  if (remainingTickets !== 0 || remainingBatch !== 0) {
    throw new Error(`Pipeline V2 QA cleanup failed: tickets=${remainingTickets}, batches=${remainingBatch}`);
  }
}
