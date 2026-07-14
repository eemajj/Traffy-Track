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
const runId = `evidence-${Date.now()}`;
const batchId = crypto.randomUUID();
const departmentId = crypto.randomUUID();
const department = `__${runId}-department`;
const paths = [1, 2, 3].map((version) => `${batchId}/${departmentId}/${runId}-v${version}.pdf`);
const pdfBytes = new TextEncoder().encode("%PDF-1.4\n% staging evidence regression\n%%EOF");
const sha256 = Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256", pdfBytes)),
  (byte) => byte.toString(16).padStart(2, "0")
).join("");
let cleanedUp = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function upload(path) {
  const result = await supabase.storage.from("report-evidence").upload(path, pdfBytes, {
    contentType: "application/pdf",
    upsert: true
  });
  if (result.error) throw result.error;
}

async function createIntent(path, filename, expiresAt) {
  const result = await supabase.from("report_evidence_upload_intents").insert({
    report_batch_department_id: departmentId,
    object_path: path,
    original_filename: filename,
    content_type: "application/pdf",
    expected_size_bytes: pdfBytes.byteLength,
    expires_at: expiresAt
  });
  if (result.error) throw result.error;
}

async function cleanup() {
  await supabase.from("report_batches").delete().eq("id", batchId);
  await supabase.storage.from("report-evidence").remove(paths);
  await supabase.from("storage_deletion_outbox").delete().in("object_path", paths);
}

async function cleanupStaleRegressionArtifacts() {
  const staleBatches = await supabase
    .from("report_batches")
    .select("id")
    .like("note", "Evidence staging regression evidence-%");
  if (staleBatches.error) throw staleBatches.error;
  if (staleBatches.data.length > 0) {
    const staleBatchDelete = await supabase
      .from("report_batches")
      .delete()
      .in("id", staleBatches.data.map((batch) => batch.id));
    if (staleBatchDelete.error) throw staleBatchDelete.error;
  }

  const outbox = await supabase
    .from("storage_deletion_outbox")
    .select("id, bucket, object_path");
  if (outbox.error) throw outbox.error;
  const staleJobs = outbox.data.filter((job) => /\/evidence-\d+-v[123]\.pdf$/.test(job.object_path));
  for (const job of staleJobs) {
    await supabase.storage.from(job.bucket).remove([job.object_path]);
  }
  if (staleJobs.length > 0) {
    const staleJobDelete = await supabase
      .from("storage_deletion_outbox")
      .delete()
      .in("id", staleJobs.map((job) => job.id));
    if (staleJobDelete.error) throw staleJobDelete.error;
  }
}

try {
  await cleanupStaleRegressionArtifacts();

  const existingJobs = await supabase
    .from("storage_deletion_outbox")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "processing", "failed"]);
  if (existingJobs.error) throw existingJobs.error;
  assert(existingJobs.count === 0, "Staging has unrelated active outbox jobs; refusing to claim them in this regression");

  const batchInsert = await supabase.from("report_batches").insert({
    id: batchId,
    report_date: "2026-07-14",
    note: `Evidence staging regression ${runId}`,
    idempotency_key: crypto.randomUUID()
  });
  if (batchInsert.error) throw batchInsert.error;
  const departmentInsert = await supabase.from("report_batch_departments").insert({
    id: departmentId,
    report_batch_id: batchId,
    dept_name: department
  });
  if (departmentInsert.error) throw departmentInsert.error;

  await upload(paths[0]);
  await createIntent(paths[0], "หลักฐาน-รอบแรก.pdf", new Date(Date.now() + 15 * 60 * 1000).toISOString());
  const firstAttach = await supabase.rpc("attach_report_evidence_version", {
    p_department_id: departmentId,
    p_object_path: paths[0],
    p_actual_size_bytes: pdfBytes.byteLength,
    p_detected_content_type: "application/pdf",
    p_sha256: sha256,
    p_actor_role: "operator"
  });
  if (firstAttach.error) throw firstAttach.error;
  assert(firstAttach.data.versionNumber === 1, "first evidence version number is not 1");
  assert(firstAttach.data.sha256 === sha256, "stored evidence checksum does not match uploaded bytes");

  const retryAttach = await supabase.rpc("attach_report_evidence_version", {
    p_department_id: departmentId,
    p_object_path: paths[0],
    p_actual_size_bytes: pdfBytes.byteLength,
    p_detected_content_type: "application/pdf",
    p_sha256: sha256,
    p_actor_role: "operator"
  });
  if (retryAttach.error) throw retryAttach.error;
  assert(retryAttach.data.id === firstAttach.data.id, "attach retry created a duplicate version");

  const directMutation = await supabase
    .from("report_evidence_versions")
    .update({ sha256: "0".repeat(64) })
    .eq("id", firstAttach.data.id);
  assert(Boolean(directMutation.error), "service role could mutate immutable evidence metadata directly");

  await upload(paths[1]);
  await createIntent(paths[1], "evidence-v2.pdf", new Date(Date.now() + 15 * 60 * 1000).toISOString());
  const secondAttach = await supabase.rpc("attach_report_evidence_version", {
    p_department_id: departmentId,
    p_object_path: paths[1],
    p_actual_size_bytes: pdfBytes.byteLength,
    p_detected_content_type: "application/pdf",
    p_sha256: sha256,
    p_actor_role: "admin"
  });
  if (secondAttach.error) throw secondAttach.error;
  assert(secondAttach.data.versionNumber === 2, "replacement evidence version number is not sequential");

  const firstStillStored = await supabase.storage.from("report-evidence").download(paths[0]);
  assert(!firstStillStored.error, "uploading a replacement deleted the previous evidence object");

  const delayedFirstRetry = await supabase.rpc("attach_report_evidence_version", {
    p_department_id: departmentId,
    p_object_path: paths[0],
    p_actual_size_bytes: pdfBytes.byteLength,
    p_detected_content_type: "application/pdf",
    p_sha256: sha256,
    p_actor_role: "operator"
  });
  if (delayedFirstRetry.error) throw delayedFirstRetry.error;
  const currentAfterDelayedRetry = await supabase
    .from("report_batch_departments")
    .select("current_evidence_version_id")
    .eq("id", departmentId)
    .single();
  if (currentAfterDelayedRetry.error) throw currentAfterDelayedRetry.error;
  assert(currentAfterDelayedRetry.data.current_evidence_version_id === secondAttach.data.id, "delayed completion retry repointed current evidence to an older version");

  const staleReview = await supabase.rpc("review_report_evidence_version_v2", {
    p_department_id: departmentId,
    p_evidence_version_id: firstAttach.data.id,
    p_decision: "approved",
    p_note: null,
    p_actor_role: "admin"
  });
  assert(staleReview.error?.code === "PT409", "stale evidence review was not rejected with a conflict");

  const operatorReview = await supabase.rpc("review_report_evidence_version_v2", {
    p_department_id: departmentId,
    p_evidence_version_id: secondAttach.data.id,
    p_decision: "approved",
    p_note: null,
    p_actor_role: "operator"
  });
  assert(Boolean(operatorReview.error), "operator was allowed to approve evidence");

  const missingRejectionReason = await supabase.rpc("review_report_evidence_version_v2", {
    p_department_id: departmentId,
    p_evidence_version_id: secondAttach.data.id,
    p_decision: "rejected",
    p_note: "   ",
    p_actor_role: "admin"
  });
  assert(missingRejectionReason.error?.code === "PT400", "rejection without a useful reason was accepted");

  const pendingRollup = await supabase.from("report_batch_evidence_rollup").select("*").eq("report_batch_id", batchId).single();
  if (pendingRollup.error) throw pendingRollup.error;
  assert(pendingRollup.data.completion_status === "incomplete", "pending evidence was counted as a complete report");

  const approved = await supabase.rpc("review_report_evidence_version_v2", {
    p_department_id: departmentId,
    p_evidence_version_id: secondAttach.data.id,
    p_decision: "approved",
    p_note: "Staging regression approved",
    p_actor_role: "admin"
  });
  if (approved.error) throw approved.error;
  const approvedRollup = await supabase.from("report_batch_evidence_rollup").select("*").eq("report_batch_id", batchId).single();
  if (approvedRollup.error) throw approvedRollup.error;
  assert(approvedRollup.data.completion_status === "complete", "all-approved evidence did not complete the report");
  assert(approvedRollup.data.evidence_approved_count === 1, "approved rollup count is incorrect");

  const terminalReview = await supabase.rpc("review_report_evidence_version_v2", {
    p_department_id: departmentId,
    p_evidence_version_id: secondAttach.data.id,
    p_decision: "rejected",
    p_note: "must remain terminal",
    p_actor_role: "admin"
  });
  assert(Boolean(terminalReview.error), "terminal evidence review could be overwritten");

  const anonReview = await anon.rpc("review_report_evidence_version_v2", {
    p_department_id: departmentId,
    p_evidence_version_id: secondAttach.data.id,
    p_decision: "approved",
    p_note: null,
    p_actor_role: "admin"
  });
  assert(Boolean(anonReview.error), "anon role could execute evidence review RPC");

  const events = await supabase
    .from("report_evidence_status_events")
    .select("status")
    .in("evidence_version_id", [firstAttach.data.id, secondAttach.data.id]);
  if (events.error) throw events.error;
  assert(events.data.filter((event) => event.status === "submitted").length === 2, "submitted events were not append-only per version");
  assert(events.data.filter((event) => event.status === "approved").length === 1, "approved event was not recorded exactly once");

  const staleWithdraw = await supabase.rpc("withdraw_report_evidence_v2", {
    p_department_id: departmentId,
    p_evidence_version_id: firstAttach.data.id,
    p_actor_role: "admin",
    p_reason: "must reject stale version"
  });
  assert(staleWithdraw.error?.code === "PT409", "stale evidence withdrawal was not rejected with a conflict");

  const operatorWithdraw = await supabase.rpc("withdraw_report_evidence_v2", {
    p_department_id: departmentId,
    p_evidence_version_id: secondAttach.data.id,
    p_actor_role: "operator",
    p_reason: "must fail"
  });
  assert(Boolean(operatorWithdraw.error), "operator was allowed to withdraw evidence");
  const shortWithdrawalReason = await supabase.rpc("withdraw_report_evidence_v2", {
    p_department_id: departmentId,
    p_evidence_version_id: secondAttach.data.id,
    p_actor_role: "admin",
    p_reason: "no"
  });
  assert(shortWithdrawalReason.error?.code === "PT400", "short withdrawal reason was accepted");

  const withdrawn = await supabase.rpc("withdraw_report_evidence_v2", {
    p_department_id: departmentId,
    p_evidence_version_id: secondAttach.data.id,
    p_actor_role: "admin",
    p_reason: "Staging regression"
  });
  if (withdrawn.error) throw withdrawn.error;
  const withdrawnRetry = await supabase.rpc("withdraw_report_evidence_v2", {
    p_department_id: departmentId,
    p_evidence_version_id: secondAttach.data.id,
    p_actor_role: "admin",
    p_reason: "Staging regression"
  });
  if (withdrawnRetry.error) throw withdrawnRetry.error;
  assert(withdrawnRetry.data.idempotent === true, "withdraw retry was not idempotent");

  await upload(paths[2]);
  await createIntent(paths[2], "abandoned.pdf", new Date(Date.now() - 60 * 1000).toISOString());
  const expired = await supabase.rpc("expire_evidence_upload_intents");
  if (expired.error) throw expired.error;
  assert(expired.data === 1, "expired upload intent was not queued for deletion");

  const batchDelete = await supabase.from("report_batches").delete().eq("id", batchId);
  if (batchDelete.error) throw batchDelete.error;

  const [claimA, claimB] = await Promise.all([
    supabase.rpc("claim_storage_deletions", { p_limit: 100 }),
    supabase.rpc("claim_storage_deletions", { p_limit: 100 })
  ]);
  if (claimA.error) throw claimA.error;
  if (claimB.error) throw claimB.error;
  const jobs = [...claimA.data, ...claimB.data].filter((job) => paths.includes(job.object_path));
  assert(jobs.length === 3, `expected 3 evidence deletion jobs, received ${jobs.length}`);
  assert(new Set(jobs.map((job) => job.id)).size === jobs.length, "two workers claimed the same outbox job");

  for (const job of jobs) {
    const referenced = await supabase.rpc("is_storage_object_referenced", {
      p_bucket: job.bucket,
      p_object_path: job.object_path
    });
    if (referenced.error) throw referenced.error;
    assert(referenced.data === false, "deleted/withdrawn evidence is still reported as live-referenced");
    const remove = await supabase.storage.from(job.bucket).remove([job.object_path]);
    if (remove.error) throw remove.error;
    const complete = await supabase.rpc("complete_storage_deletion", {
      p_id: job.id,
      p_lease_token: job.lease_token
    });
    if (complete.error) throw complete.error;
    assert(complete.data === true, "outbox job could not be completed with its lease");
  }

  const completedJobs = await supabase
    .from("storage_deletion_outbox")
    .select("status")
    .in("object_path", paths);
  if (completedJobs.error) throw completedJobs.error;
  assert(completedJobs.data.every((job) => job.status === "completed"), "not every evidence deletion job completed");

  await cleanup();
  cleanedUp = true;
  console.log(JSON.stringify({
    projectRef,
    checks: {
      verifiedMetadataAndChecksum: "passed",
      idempotentAttach: "passed",
      immutableMetadata: "passed",
      delayedRetryDoesNotRepoint: "passed",
      exactVersionConflict: "passed",
      rejectionReasonRequired: "passed",
      approvedOnlyCompletion: "passed",
      appendOnlyVersions: "passed",
      appendOnlyStatusEvents: "passed",
      adminOnlyReviewAndWithdraw: "passed",
      exactVersionWithdrawConflict: "passed",
      withdrawalReasonRequired: "passed",
      idempotentWithdraw: "passed",
      terminalReview: "passed",
      anonDenied: "passed",
      expiredIntentQueued: "passed",
      cascadeDeletionQueued: "passed",
      concurrentLeaseClaim: "passed",
      storageCleanupCompleted: "passed"
    },
    cleanup: "passed"
  }, null, 2));
} finally {
  if (!cleanedUp) await cleanup();
}
