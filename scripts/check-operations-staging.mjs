import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const projectRef = process.env.SUPABASE_PROJECT_REF;
if (!projectRef) throw new Error("SUPABASE_PROJECT_REF is required");

let input = "";
for await (const chunk of process.stdin) input += chunk;
const keys = JSON.parse(input);
const serviceRole = keys.find((item) => item.name === "service_role" && item.type === "legacy")?.api_key;
const anonKey = keys.find((item) => item.name === "anon" && item.type === "legacy")?.api_key;
if (!serviceRole || !anonKey) throw new Error("Staging API keys were not found");

const url = `https://${projectRef}.supabase.co`;
const supabase = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = `operations-${Date.now()}`;
const objectPath = `__qa/${runId}.pdf`;
const leaseToken = crypto.randomUUID();
let outboxId = null;
let importBatchId = null;
let heartbeatBatchId = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cleanup() {
  if (outboxId) await supabase.from("storage_deletion_outbox").delete().eq("id", outboxId);
  if (importBatchId) await supabase.from("import_batches").delete().eq("id", importBatchId);
  if (heartbeatBatchId) await supabase.from("import_batches").delete().eq("id", heartbeatBatchId);
  const resourceIds = [importBatchId, heartbeatBatchId].filter(Boolean);
  if (resourceIds.length > 0) await supabase.from("audit_events").delete().in("resource_id", resourceIds);
}

try {
  const health = await supabase.rpc("operations_health_snapshot");
  if (health.error) throw health.error;
  assert(health.data?.outbox && health.data?.imports, "operations health payload is incomplete");

  const anonHealth = await anon.rpc("operations_health_snapshot");
  assert(Boolean(anonHealth.error), "anonymous operations health access was not denied");

  const outbox = await supabase
    .from("storage_deletion_outbox")
    .insert({
      bucket: "report-evidence",
      object_path: objectPath,
      reason: "qa_dead_letter",
      status: "processing",
      attempts: 10,
      lease_token: leaseToken,
      locked_until: new Date(Date.now() + 60_000).toISOString()
    })
    .select("id")
    .single();
  if (outbox.error) throw outbox.error;
  outboxId = outbox.data.id;

  const failed = await supabase.rpc("fail_storage_deletion", {
    p_id: outboxId,
    p_lease_token: leaseToken,
    p_error: "QA terminal retry"
  });
  if (failed.error) throw failed.error;
  assert(failed.data === true, "terminal outbox failure was not accepted");

  const dead = await supabase
    .from("storage_deletion_outbox")
    .select("status, attempts")
    .eq("id", outboxId)
    .single();
  if (dead.error) throw dead.error;
  assert(dead.data.status === "dead" && dead.data.attempts === 10, "outbox job was not dead-lettered");

  const staleBatch = await supabase
    .from("import_batches")
    .insert({
      filename: `__${runId}.csv`,
      status: "queued",
      imported_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    })
    .select("id")
    .single();
  if (staleBatch.error) throw staleBatch.error;
  importBatchId = staleBatch.data.id;

  const recovered = await supabase.rpc("recover_stale_import_jobs");
  if (recovered.error) throw recovered.error;
  assert(
    recovered.data?.importBatchIds?.includes(importBatchId),
    "stale import batch was not reported as recovered"
  );

  const recoveredBatch = await supabase
    .from("import_batches")
    .select("status, error_message, completed_at")
    .eq("id", importBatchId)
    .single();
  if (recoveredBatch.error) throw recoveredBatch.error;
  assert(
    recoveredBatch.data.status === "failed" && Boolean(recoveredBatch.data.completed_at),
    "stale import batch was not closed as failed"
  );

  const audit = await supabase
    .from("audit_events")
    .select("action, outcome")
    .eq("resource_id", importBatchId)
    .eq("action", "import.stale_recovered")
    .single();
  if (audit.error) throw audit.error;
  assert(audit.data.outcome === "failure", "stale import recovery audit was not recorded");

  const heartbeatBatch = await supabase
    .from("import_batches")
    .insert({
      filename: `__${runId}-heartbeat.csv`,
      status: "running",
      imported_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      heartbeat_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    })
    .select("id")
    .single();
  if (heartbeatBatch.error) throw heartbeatBatch.error;
  heartbeatBatchId = heartbeatBatch.data.id;

  const heartbeat = await supabase.rpc("heartbeat_import_batch", {
    p_import_batch_id: heartbeatBatchId
  });
  if (heartbeat.error) throw heartbeat.error;
  assert(heartbeat.data === true, "running import heartbeat was not accepted");

  const anonHeartbeat = await anon.rpc("heartbeat_import_batch", {
    p_import_batch_id: heartbeatBatchId
  });
  assert(Boolean(anonHeartbeat.error), "anonymous import heartbeat access was not denied");

  const healthyRecovery = await supabase.rpc("recover_stale_import_jobs");
  if (healthyRecovery.error) throw healthyRecovery.error;
  assert(
    !healthyRecovery.data?.importBatchIds?.includes(heartbeatBatchId),
    "freshly heartbeating import was incorrectly recovered"
  );

  await cleanup();
  console.log(JSON.stringify({
    projectRef,
    checks: {
      healthSnapshot: "passed",
      anonHealthDenied: "passed",
      deadLetterAtAttemptLimit: "passed",
      staleImportRecovery: "passed",
      staleImportAudit: "passed",
      runningImportHeartbeat: "passed",
      anonHeartbeatDenied: "passed"
    },
    cleanup: "passed"
  }, null, 2));
} finally {
  await cleanup();
}
