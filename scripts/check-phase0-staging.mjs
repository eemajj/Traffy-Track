import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const projectRef = process.env.SUPABASE_PROJECT_REF;
if (!projectRef) {
  throw new Error("SUPABASE_PROJECT_REF is required");
}

let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
}

const apiKeys = JSON.parse(input);
const serviceRole = apiKeys.find((item) => item.name === "service_role" && item.type === "legacy")?.api_key;
if (!serviceRole) {
  throw new Error("Staging service-role key was not found");
}

const supabase = createClient(`https://${projectRef}.supabase.co`, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const runId = `phase0-${Date.now()}`;
const firstFilename = `__${runId}-active-1.csv`;
const secondFilename = `__${runId}-active-2.csv`;
const ticketId = `__${runId}-null-state`;
const transactionTicketId = `__${runId}-transaction`;
const rollbackTicketId = `__${runId}-rollback`;
const department = `__${runId}-department`;
const createdBatchIds = [];
let cleanedUp = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function cleanup() {
  const ticketDelete = await supabase
    .from("tickets")
    .delete()
    .in("ticket_id", [ticketId, transactionTicketId, rollbackTicketId]);
  if (ticketDelete.error) throw ticketDelete.error;
  if (createdBatchIds.length > 0) {
    const batchDelete = await supabase.from("import_batches").delete().in("id", createdBatchIds);
    if (batchDelete.error) throw batchDelete.error;
  }
}

try {
  await cleanup();

  const beforeAnalytics = await supabase.rpc("analytics_overview", { p_days: 30 });
  if (beforeAnalytics.error) throw beforeAnalytics.error;
  const pendingBefore = beforeAnalytics.data?.summary?.pendingNow;
  assert(Number.isInteger(pendingBefore), "analytics_overview did not return summary.pendingNow");

  const firstBatch = await supabase
    .from("import_batches")
    .insert({ filename: firstFilename, status: "queued" })
    .select("id")
    .single();
  if (firstBatch.error) throw firstBatch.error;
  createdBatchIds.push(firstBatch.data.id);

  const blockedBatch = await supabase
    .from("import_batches")
    .insert({ filename: secondFilename, status: "queued" })
    .select("id")
    .single();
  assert(blockedBatch.error?.code === "23505", `second active batch was not blocked (code ${blockedBatch.error?.code || "none"})`);

  const releaseBatch = await supabase
    .from("import_batches")
    .update({ status: "failed", error_message: "Phase 0 staging regression", completed_at: new Date().toISOString() })
    .eq("id", firstBatch.data.id);
  if (releaseBatch.error) throw releaseBatch.error;

  const secondBatch = await supabase
    .from("import_batches")
    .insert({ filename: secondFilename, status: "queued" })
    .select("id")
    .single();
  if (secondBatch.error) throw secondBatch.error;
  createdBatchIds.push(secondBatch.data.id);
  const releaseSecondBatch = await supabase
    .from("import_batches")
    .update({ status: "failed", error_message: "Phase 0 staging regression", completed_at: new Date().toISOString() })
    .eq("id", secondBatch.data.id);
  if (releaseSecondBatch.error) throw releaseSecondBatch.error;

  const insertedTicket = await supabase.from("tickets").insert({
    ticket_id: ticketId,
    state: null,
    dept_list: [department],
    org_list: [department],
    comment: "Phase 0 staging null-state regression"
  });
  if (insertedTicket.error) throw insertedTicket.error;

  const pendingQuery = await supabase
    .from("tickets")
    .select("ticket_id")
    .eq("ticket_id", ticketId)
    .or('state.is.null,state.not.in.("เสร็จสิ้น","ไม่เกี่ยวข้อง","ส่งต่อ(ใหม่)")');
  if (pendingQuery.error) throw pendingQuery.error;
  assert(pendingQuery.data.length === 1, "null-state ticket was excluded by the PostgREST pending filter");

  const departmentSummary = await supabase.rpc("dashboard_pending_by_department");
  if (departmentSummary.error) throw departmentSummary.error;
  assert(
    departmentSummary.data.some((row) => row.dept_name === department && Number(row.pending_count) === 1),
    "null-state ticket was excluded from dashboard_pending_by_department"
  );

  const afterAnalytics = await supabase.rpc("analytics_overview", { p_days: 30 });
  if (afterAnalytics.error) throw afterAnalytics.error;
  assert(
    afterAnalytics.data?.summary?.pendingNow === pendingBefore + 1,
    "null-state ticket did not increment analytics pendingNow"
  );

  const baseTicket = {
    ticket_id: transactionTicketId,
    type: "staging-check",
    comment: "before",
    photo_url: null,
    address: "preserve-me",
    subdistrict: null,
    district: null,
    province: null,
    timestamp: "2026-07-14T00:00:00.000Z",
    last_activity: "2026-07-14T00:00:00.000Z",
    state: "รับเรื่องแล้ว",
    org_response: department,
    org_list: [department],
    dept_list: [department],
    star: null,
    hashtag: null,
    lat: null,
    lng: null
  };
  const baseTicketInsert = await supabase.from("tickets").insert(baseTicket);
  if (baseTicketInsert.error) throw baseTicketInsert.error;

  const applyBatch = await supabase
    .from("import_batches")
    .insert({ filename: `__${runId}-transaction.csv`, status: "queued" })
    .select("id")
    .single();
  if (applyBatch.error) throw applyBatch.error;
  createdBatchIds.push(applyBatch.data.id);

  const startApplyBatch = await supabase
    .from("import_batches")
    .update({ status: "running" })
    .eq("id", applyBatch.data.id)
    .eq("status", "queued");
  if (startApplyBatch.error) throw startApplyBatch.error;

  const applyResult = await supabase.rpc("apply_import_batch", {
    p_import_batch_id: applyBatch.data.id,
    p_tickets: [{ ...baseTicket, comment: "after" }],
    p_history: [{
      ticket_id: transactionTicketId,
      changed_field: "comment",
      old_value: "before",
      new_value: "after",
      import_batch_id: applyBatch.data.id
    }],
    p_total_rows: 1,
    p_processed_rows: 1,
    p_duplicate_rows: 0,
    p_new_tickets: 0,
    p_reopened_tickets: 0,
    p_changed_tickets: 1,
    p_unchanged_tickets: 0,
    p_changed_fields: 1
  });
  if (applyResult.error) throw applyResult.error;

  const appliedTicket = await supabase
    .from("tickets")
    .select("comment, address")
    .eq("ticket_id", transactionTicketId)
    .single();
  if (appliedTicket.error) throw appliedTicket.error;
  assert(appliedTicket.data.comment === "after", "transactional import did not update the changed field");
  assert(appliedTicket.data.address === "preserve-me", "transactional import cleared a preserved field");

  const rollbackBatch = await supabase
    .from("import_batches")
    .insert({ filename: `__${runId}-rollback.csv`, status: "queued" })
    .select("id")
    .single();
  if (rollbackBatch.error) throw rollbackBatch.error;
  createdBatchIds.push(rollbackBatch.data.id);

  const startRollbackBatch = await supabase
    .from("import_batches")
    .update({ status: "running" })
    .eq("id", rollbackBatch.data.id)
    .eq("status", "queued");
  if (startRollbackBatch.error) throw startRollbackBatch.error;

  const rollbackResult = await supabase.rpc("apply_import_batch", {
    p_import_batch_id: rollbackBatch.data.id,
    p_tickets: [{ ...baseTicket, ticket_id: rollbackTicketId }],
    p_history: [{
      ticket_id: `__${runId}-missing-parent`,
      changed_field: "new_ticket",
      old_value: null,
      new_value: "รับเรื่องแล้ว",
      import_batch_id: rollbackBatch.data.id
    }],
    p_total_rows: 1,
    p_processed_rows: 1,
    p_duplicate_rows: 0,
    p_new_tickets: 1,
    p_reopened_tickets: 0,
    p_changed_tickets: 0,
    p_unchanged_tickets: 0,
    p_changed_fields: 0
  });
  assert(Boolean(rollbackResult.error), "invalid history did not fail the transactional import");

  const rolledBackTicket = await supabase
    .from("tickets")
    .select("ticket_id", { count: "exact", head: true })
    .eq("ticket_id", rollbackTicketId);
  if (rolledBackTicket.error) throw rolledBackTicket.error;
  assert(rolledBackTicket.count === 0, "failed transactional import left a partial ticket write");
  const releaseRollbackBatch = await supabase
    .from("import_batches")
    .update({ status: "failed", error_message: "Expected Phase 0 rollback regression", completed_at: new Date().toISOString() })
    .eq("id", rollbackBatch.data.id);
  if (releaseRollbackBatch.error) throw releaseRollbackBatch.error;

  await cleanup();
  cleanedUp = true;

  console.log(JSON.stringify({
    projectRef,
    checks: {
      singleActiveConstraint: "passed",
      activeSlotRelease: "passed",
      postgrestNullPending: "passed",
      dashboardNullPending: "passed",
      analyticsNullPending: "passed",
      transactionalApply: "passed",
      transactionalRollback: "passed"
    },
    cleanup: "passed"
  }, null, 2));
} finally {
  if (!cleanedUp) await cleanup();
}
