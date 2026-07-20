import { randomUUID } from "node:crypto";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "pyyoysdcedaskohiocdg";
if (process.env.SUPABASE_PROJECT_REF !== STAGING_PROJECT_REF) {
  throw new Error("Import large-file QA is restricted to the Staging project");
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const keys = JSON.parse(input);
const serviceRole = keys.find((item) => item.name === "service_role" && item.type === "legacy")?.api_key;
const anonKey = keys.find((item) => item.name === "anon" && item.type === "legacy")?.api_key;
if (!serviceRole || !anonKey) throw new Error("Staging API keys were not found");

const url = `https://${STAGING_PROJECT_REF}.supabase.co`;
const supabase = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = randomUUID();
const filename = `__import-large-file-${runId}.csv`;
const storagePath = `incoming/__import-large-file-${runId}.csv`;
let importBatchId = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const active = await supabase.from("import_batches").select("id").in("status", ["queued", "running"]);
  if (active.error) throw active.error;
  assert(active.data.length === 0, "Staging import queue must be empty before this QA");

  const inserted = await supabase.from("import_batches").insert({
    filename,
    storage_path: storagePath,
    status: "queued",
    error_message: "previous statement timeout"
  }).select("id").single();
  if (inserted.error) throw inserted.error;
  importBatchId = inserted.data.id;

  const claimed = await supabase.rpc("claim_import_batches", { p_limit: 1, p_lease_seconds: 120 });
  if (claimed.error) throw claimed.error;
  assert(claimed.data?.[0]?.id === importBatchId, "QA import batch was not claimed");
  const leaseToken = claimed.data[0].lease_token;

  const running = await supabase.from("import_batches")
    .select("status,error_message,attempt_count,max_attempts")
    .eq("id", importBatchId)
    .single();
  if (running.error) throw running.error;
  assert(running.data.status === "running", "claimed QA job is not running");
  assert(running.data.error_message === "previous statement timeout", "prior retry error was cleared on claim");
  assert(running.data.attempt_count === 1, "claim did not increment attempt count");

  const applied = await supabase.rpc("apply_claimed_import_batch", {
    p_import_batch_id: importBatchId,
    p_lease_token: leaseToken,
    p_tickets: [],
    p_history: [],
    p_total_rows: 0,
    p_processed_rows: 0,
    p_duplicate_rows: 0,
    p_new_tickets: 0,
    p_reopened_tickets: 0,
    p_changed_tickets: 0,
    p_unchanged_tickets: 0,
    p_changed_fields: 0
  });
  if (applied.error) throw applied.error;

  const completed = await supabase.from("import_batches")
    .select("status,error_message,attempt_count")
    .eq("id", importBatchId)
    .single();
  if (completed.error) throw completed.error;
  assert(completed.data.status === "completed", "atomic apply did not complete the QA job");
  assert(completed.data.error_message === null, "successful apply did not clear the prior retry error");

  const anonCall = await anon.rpc("preserve_import_retry_error");
  assert(Boolean(anonCall.error), "anonymous role could execute the retry-error trigger function");

  console.log(JSON.stringify({
    projectRef: STAGING_PROJECT_REF,
    checks: {
      queueEmptyBeforeQa: "passed",
      retryErrorPreservedOnClaim: "passed",
      attemptIncremented: "passed",
      atomicApplyCompleted: "passed",
      successClearedRetryError: "passed",
      anonymousTriggerExecutionDenied: "passed"
    }
  }, null, 2));
} finally {
  if (importBatchId) await supabase.from("import_batches").delete().eq("id", importBatchId);
}
