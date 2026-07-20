import process from "node:process";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const PRODUCTION_PROJECT_REF = "zllbfazkhrvlfutehkyh";
const EXPECTED_PRODUCTION_HOST = `${PRODUCTION_PROJECT_REF}.supabase.co`;
const REQUIRED_BATCH_COLUMNS = [
  "id",
  "pipeline_version",
  "source_storage_path_v2",
  "processing_phase",
  "status",
  "lease_token",
  "locked_until"
];
const REQUIRED_TABLE_COLUMNS = {
  import_ticket_stage: ["import_batch_id", "ticket_id", "timestamp", "last_activity", "state"],
  import_history_stage: ["import_batch_id", "ticket_id", "changed_field", "old_value", "new_value"]
};
const REQUIRED_RPCS = {
  claim_import_batches_v2: ["p_limit", "p_lease_seconds"],
  reset_claimed_import_stage_v2: ["p_import_batch_id", "p_lease_token", "p_lease_seconds"],
  stage_claimed_import_rows_v2: ["p_import_batch_id", "p_lease_token", "p_tickets", "p_history", "p_lease_seconds"],
  continue_claimed_import_batch_v2: [
    "p_import_batch_id", "p_lease_token", "p_total_rows", "p_processed_rows",
    "p_duplicate_rows", "p_new_tickets", "p_reopened_tickets", "p_changed_tickets",
    "p_unchanged_tickets", "p_changed_fields", "p_expected_tickets", "p_expected_history"
  ],
  finalize_staged_import_batch_v2: ["p_import_batch_id", "p_lease_token"],
  release_import_batch_claim_v2: ["p_import_batch_id", "p_lease_token", "p_error_message", "p_retryable"]
};

nextEnv.loadEnvConfig(process.cwd());

function requireValue(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (process.env.PRODUCTION_PREFLIGHT_CONFIRM !== PRODUCTION_PROJECT_REF) {
  throw new Error(`Set PRODUCTION_PREFLIGHT_CONFIRM=${PRODUCTION_PROJECT_REF}`);
}

const supabaseUrl = new URL(requireValue("SUPABASE_URL"));
if (supabaseUrl.protocol !== "https:" || supabaseUrl.hostname !== EXPECTED_PRODUCTION_HOST) {
  throw new Error(`Import V2 contract check refuses ${supabaseUrl.hostname}; expected ${EXPECTED_PRODUCTION_HOST}`);
}

const serviceRoleKey = requireValue("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(supabaseUrl.origin, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const openApiResponse = await fetch(`${supabaseUrl.origin}/rest/v1/`, {
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Accept: "application/openapi+json"
  }
});
if (!openApiResponse.ok) throw new Error(`Production PostgREST schema read failed (${openApiResponse.status})`);
const openApi = await openApiResponse.json();
const paths = openApi?.paths || {};
const definitions = openApi?.definitions || openApi?.components?.schemas || {};

function assertDefinitionColumns(table, columns) {
  const properties = definitions?.[table]?.properties || {};
  for (const column of columns) assert(column in properties, `${table}.${column} is missing from PostgREST schema`);
}

assertDefinitionColumns("import_batches", REQUIRED_BATCH_COLUMNS);
for (const [table, columns] of Object.entries(REQUIRED_TABLE_COLUMNS)) {
  assert(`/${table}` in paths, `${table} is missing from PostgREST schema`);
  assertDefinitionColumns(table, columns);
}

for (const [rpc, parameters] of Object.entries(REQUIRED_RPCS)) {
  const operation = paths?.[`/rpc/${rpc}`]?.post;
  assert(operation, `${rpc} RPC is missing from PostgREST schema`);
  const serialized = `${JSON.stringify(operation)}${JSON.stringify(definitions?.[rpc] || {})}`;
  for (const parameter of parameters) assert(serialized.includes(`\"${parameter}\"`), `${rpc}.${parameter} is missing from RPC schema`);
}

const [batchProbe, ticketStageProbe, historyStageProbe, activeV2] = await Promise.all([
  admin.from("import_batches").select(REQUIRED_BATCH_COLUMNS.join(","), { head: true, count: "exact" }).limit(0),
  admin.from("import_ticket_stage").select("import_batch_id", { head: true, count: "exact" }),
  admin.from("import_history_stage").select("import_batch_id", { head: true, count: "exact" }),
  admin.from("import_batches").select("id", { head: true, count: "exact" })
    .eq("pipeline_version", 2).in("status", ["queued", "running"])
]);

for (const [label, probe] of Object.entries({ batchProbe, ticketStageProbe, historyStageProbe, activeV2 })) {
  if (probe.error) throw new Error(`${label} failed: ${probe.error.message}`);
}
assert((activeV2.count || 0) === 0, "Production has an active Import Pipeline V2 job");
assert((ticketStageProbe.count || 0) === 0, "Production import_ticket_stage is not empty");
assert((historyStageProbe.count || 0) === 0, "Production import_history_stage is not empty");

console.log(JSON.stringify({
  ok: true,
  projectRef: PRODUCTION_PROJECT_REF,
  schema: {
    batchColumns: REQUIRED_BATCH_COLUMNS.length,
    stageTables: Object.keys(REQUIRED_TABLE_COLUMNS),
    rpcs: Object.keys(REQUIRED_RPCS)
  },
  queues: { activeV2: 0, stagedTickets: 0, stagedHistory: 0 },
  mutationPerformed: false
}, null, 2));
