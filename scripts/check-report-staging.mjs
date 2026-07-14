import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const projectRef = process.env.SUPABASE_PROJECT_REF;
if (!projectRef) throw new Error("SUPABASE_PROJECT_REF is required");

let input = "";
for await (const chunk of process.stdin) input += chunk;
const apiKeys = JSON.parse(input);
const serviceRole = apiKeys.find((item) => item.name === "service_role" && item.type === "legacy")?.api_key;
const anonKey = apiKeys.find((item) => item.name === "anon" && item.type === "legacy")?.api_key;
if (!serviceRole || !anonKey) throw new Error("Required Staging API keys were not found");

const url = `https://${projectRef}.supabase.co`;
const supabase = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const runId = `report-${Date.now()}`;
const ticketId = `__${runId}-ticket`;
const department = `__${runId}-department`;
const idempotencyKey = crypto.randomUUID();
const blockedIdempotencyKey = crypto.randomUUID();
const batchIds = [];
let activeImportBatchId = null;
let cleanedUp = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cleanup() {
  if (batchIds.length > 0) {
    const batchDelete = await supabase.from("report_batches").delete().in("id", batchIds);
    if (batchDelete.error) throw batchDelete.error;
  }
  const ticketDelete = await supabase.from("tickets").delete().eq("ticket_id", ticketId);
  if (ticketDelete.error) throw ticketDelete.error;
  if (activeImportBatchId) {
    const importDelete = await supabase.from("import_batches").delete().eq("id", activeImportBatchId);
    if (importDelete.error) throw importDelete.error;
  }
}

try {
  const ticketInsert = await supabase.from("tickets").insert({
    ticket_id: ticketId,
    type: "report-staging-check",
    comment: "snapshot-before",
    state: null,
    dept_list: [department, department, " "],
    org_list: [department]
  });
  if (ticketInsert.error) throw ticketInsert.error;

  const latestImport = await supabase
    .from("import_batches")
    .select("id, imported_at, completed_at")
    .eq("status", "completed")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("imported_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestImport.error) throw latestImport.error;

  const created = await supabase.rpc("create_report_batch_snapshot", {
    p_report_date: "2026-07-14",
    p_note: `Staging regression ${runId}`,
    p_idempotency_key: idempotencyKey
  });
  if (created.error) throw created.error;
  const batchId = created.data;
  batchIds.push(batchId);

  const retried = await supabase.rpc("create_report_batch_snapshot", {
    p_report_date: "2026-07-15",
    p_note: "This retry must not create another batch",
    p_idempotency_key: idempotencyKey
  });
  if (retried.error) throw retried.error;
  assert(retried.data === batchId, "same idempotency key created a different report batch");

  const batch = await supabase
    .from("report_batches")
    .select("id, report_date, snapshot_captured_at, source_import_batch_id, source_import_completed_at")
    .eq("id", batchId)
    .single();
  if (batch.error) throw batch.error;
  assert(batch.data.report_date === "2026-07-14", "idempotent retry mutated the original report batch");
  assert(Boolean(batch.data.snapshot_captured_at), "report batch has no snapshot timestamp");
  assert(
    batch.data.source_import_batch_id === (latestImport.data?.id || null),
    "report watermark does not match the latest completed import"
  );

  const items = await supabase
    .from("report_batch_items")
    .select("id, snapshot_comment")
    .eq("report_batch_id", batchId)
    .eq("dept_name", department)
    .eq("ticket_id", ticketId);
  if (items.error) throw items.error;
  assert(items.data.length === 1, "duplicate/blank department entries produced duplicate report items");
  assert(items.data[0].snapshot_comment === "snapshot-before", "report item did not capture the source snapshot");

  const ticketUpdate = await supabase.from("tickets").update({ comment: "snapshot-after" }).eq("ticket_id", ticketId);
  if (ticketUpdate.error) throw ticketUpdate.error;
  const immutableItem = await supabase
    .from("report_batch_items")
    .select("snapshot_comment")
    .eq("id", items.data[0].id)
    .single();
  if (immutableItem.error) throw immutableItem.error;
  assert(immutableItem.data.snapshot_comment === "snapshot-before", "ticket update mutated the report snapshot");

  const duplicateItem = await supabase.from("report_batch_items").insert({
    report_batch_id: batchId,
    dept_name: department,
    ticket_id: ticketId
  });
  assert(duplicateItem.error?.code === "23505", "duplicate report item was not rejected");

  const orphanDepartment = await supabase.from("report_batch_items").insert({
    report_batch_id: batchId,
    dept_name: `__${runId}-missing-department`,
    ticket_id: ticketId
  });
  assert(orphanDepartment.error?.code === "23503", "orphan report department was not rejected");

  const anonCall = await anon.rpc("create_report_batch_snapshot", {
    p_report_date: "2026-07-14",
    p_note: "must be denied",
    p_idempotency_key: crypto.randomUUID()
  });
  assert(Boolean(anonCall.error), "anon role was allowed to create a report batch");

  const activeImport = await supabase
    .from("import_batches")
    .insert({ filename: `__${runId}-active-import.csv`, status: "queued" })
    .select("id")
    .single();
  if (activeImport.error) throw activeImport.error;
  activeImportBatchId = activeImport.data.id;
  const blockedReport = await supabase.rpc("create_report_batch_snapshot", {
    p_report_date: "2026-07-14",
    p_note: "must wait for import",
    p_idempotency_key: blockedIdempotencyKey
  });
  assert(Boolean(blockedReport.error), "report creation was allowed while an import was active");

  await cleanup();
  cleanedUp = true;
  console.log(JSON.stringify({
    projectRef,
    checks: {
      atomicSnapshot: "passed",
      idempotentRetry: "passed",
      importWatermark: "passed",
      nullStateIncluded: "passed",
      duplicateDepartmentDeduped: "passed",
      snapshotImmutable: "passed",
      duplicateItemRejected: "passed",
      orphanDepartmentRejected: "passed",
      anonExecuteDenied: "passed",
      activeImportBlocked: "passed"
    },
    cleanup: "passed"
  }, null, 2));
} finally {
  if (!cleanedUp) await cleanup();
}
