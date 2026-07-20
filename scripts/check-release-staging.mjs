import process from "node:process";
import { createHash, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "pyyoysdcedaskohiocdg";
if (process.env.SUPABASE_PROJECT_REF !== STAGING_PROJECT_REF) {
  throw new Error("Release QA is restricted to the Staging project");
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
const identifierHash = createHash("sha256").update(`release-${runId}`).digest("hex");
let importBatchId = null;
let passcodeProfileId = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectDenied(promise, label) {
  const result = await promise;
  assert(Boolean(result.error), `${label} was not denied for anonymous access`);
}

async function cleanup() {
  if (importBatchId) await supabase.from("import_batches").delete().eq("id", importBatchId);
  if (passcodeProfileId) await supabase.from("passcode_profiles").delete().eq("id", passcodeProfileId);
  await supabase.from("login_rate_limits").delete().eq("identifier_hash", identifierHash);
}

try {
  const actionCenter = await supabase.rpc("workflow_action_center", {
    p_today: new Date().toISOString().slice(0, 10)
  });
  if (actionCenter.error) throw actionCenter.error;
  assert(Array.isArray(actionCenter.data), "workflow action center did not return an array");
  await expectDenied(
    anon.rpc("workflow_action_center", { p_today: new Date().toISOString().slice(0, 10) }),
    "workflow action center"
  );

  const snapshot = await supabase.rpc("create_system_backup_snapshot");
  if (snapshot.error) throw snapshot.error;
  assert(Boolean(snapshot.data?.snapshotId), "backup snapshot has no identity");
  assert(Array.isArray(snapshot.data?.tables?.tickets), "backup snapshot is missing tickets");
  assert(Array.isArray(snapshot.data?.tables?.audit_events), "backup snapshot is missing audit history");
  assert(Array.isArray(snapshot.data?.tables?.passcode_profiles), "backup snapshot is missing Passcode profiles");
  await expectDenied(anon.rpc("create_system_backup_snapshot"), "backup snapshot");
  await expectDenied(
    anon.rpc("restore_operational_history_snapshot", {
      p_assignments: [], p_workflow: [], p_audit: []
    }),
    "operational history restore"
  );
  await expectDenied(
    anon.from("passcode_profiles").select("id").limit(1),
    "Passcode profiles"
  );

  const profileInsert = await supabase
    .from("passcode_profiles")
    .insert({
      display_name: `__release-${runId}`,
      position: "Release QA",
      role_label: "ผู้บริหารเขต",
      passcode_digest: createHash("sha256").update(`passcode-${runId}`).digest("hex"),
      permissions: ["dashboard:view", "analytics:view", "map:view"],
      is_admin: false,
      is_active: true
    })
    .select("id, access_version")
    .single();
  if (profileInsert.error) throw profileInsert.error;
  passcodeProfileId = profileInsert.data.id;
  const profileUpdate = await supabase
    .from("passcode_profiles")
    .update({ role_label: "ผู้บริหารเขต (QA)" })
    .eq("id", passcodeProfileId)
    .select("access_version")
    .single();
  if (profileUpdate.error) throw profileUpdate.error;
  assert(
    profileUpdate.data.access_version === profileInsert.data.access_version + 1,
    "Passcode profile access version did not advance after permission metadata changed"
  );

  let lastAttempt;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    lastAttempt = await supabase.rpc("consume_login_attempt", {
      p_identifier_hash: identifierHash,
      p_succeeded: false
    });
    if (lastAttempt.error) throw lastAttempt.error;
  }
  assert(lastAttempt.data?.allowed === false, "fifth failed login was not throttled");
  assert(Number(lastAttempt.data?.retryAfterSeconds) > 0, "throttle did not return retry timing");
  await expectDenied(
    anon.rpc("consume_login_attempt", { p_identifier_hash: identifierHash, p_succeeded: false }),
    "login throttle"
  );

  const inserted = await supabase
    .from("import_batches")
    .insert({
      filename: `__release-${runId}.csv`,
      status: "queued",
      storage_path: `imports/__release-${runId}.csv`
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  importBatchId = inserted.data.id;

  const claimed = await supabase.rpc("claim_import_batches", { p_limit: 1, p_lease_seconds: 120 });
  if (claimed.error) throw claimed.error;
  assert(claimed.data?.[0]?.id === importBatchId, "durable importer did not claim the queued QA job");
  const leaseToken = claimed.data[0].lease_token;
  const heartbeat = await supabase.rpc("heartbeat_claimed_import_batch", {
    p_import_batch_id: importBatchId,
    p_lease_token: leaseToken,
    p_lease_seconds: 120
  });
  if (heartbeat.error) throw heartbeat.error;
  assert(heartbeat.data === true, "durable importer rejected its valid lease heartbeat");
  const staleHeartbeat = await supabase.rpc("heartbeat_claimed_import_batch", {
    p_import_batch_id: importBatchId,
    p_lease_token: randomUUID(),
    p_lease_seconds: 120
  });
  if (staleHeartbeat.error) throw staleHeartbeat.error;
  assert(staleHeartbeat.data === false, "durable importer accepted a stale lease token");
  await expectDenied(
    anon.rpc("claim_import_batches", { p_limit: 1, p_lease_seconds: 120 }),
    "durable import claim"
  );
  await expectDenied(
    anon.rpc("undo_report_evidence_withdrawal", {
      p_department_id: randomUUID(),
      p_evidence_version_id: randomUUID(),
      p_actor_role: "admin"
    }),
    "evidence withdrawal undo"
  );

  await cleanup();
  console.log(JSON.stringify({
    projectRef: STAGING_PROJECT_REF,
    checks: {
      workflowActionCenterAndAnonDenial: "passed",
      consistentBackupSnapshotAndAnonDenial: "passed",
      passcodeProfilesVersioningAndAnonDenial: "passed",
      operationalRestoreAnonDenial: "passed",
      atomicLoginThrottleAndAnonDenial: "passed",
      durableClaimLeaseHeartbeatAndAnonDenial: "passed",
      evidenceUndoAnonDenial: "passed"
    },
    cleanup: "passed"
  }, null, 2));
} finally {
  await cleanup();
}
