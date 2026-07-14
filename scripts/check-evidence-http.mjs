import process from "node:process";
import { spawnSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

// Local (the app on QA_BASE_URL must itself be configured for Staging):
//   QA_TARGET=local QA_BASE_URL=http://127.0.0.1:3100 \
//   SUPABASE_PROJECT_REF=<staging-ref> QA_SESSION_SECRET=<target-secret> node scripts/check-evidence-http.mjs
// Staging Preview adds QA_STAGING_CONFIRM=STAGING_ONLY. API keys may be supplied
// through environment variables or piped from the Supabase CLI as JSON. The
// script never prints credentials/session cookies and removes every QA artifact.

const STAGING_PROJECT_REF = "pyyoysdcedaskohiocdg";
const PRODUCTION_PROJECT_REF = "zllbfazkhrvlfutehkyh";
const PRODUCTION_APP_HOST = "traffy-track.vercel.app";
const projectRef = String(process.env.SUPABASE_PROJECT_REF || "").trim();
const target = String(process.env.QA_TARGET || "").trim();
const baseUrl = new URL(String(process.env.QA_BASE_URL || "http://127.0.0.1:3000"));
const sessionSecret = String(process.env.QA_SESSION_SECRET || process.env.APP_SESSION_SECRET || "");
const cookieName = String(process.env.APP_AUTH_COOKIE || "citydata-passcode");
const vercelDeployment = String(process.env.QA_VERCEL_DEPLOYMENT || "").trim();

if (target !== "local" && target !== "staging") {
  throw new Error("QA_TARGET must be local or staging");
}
if (projectRef !== STAGING_PROJECT_REF || projectRef === PRODUCTION_PROJECT_REF) {
  throw new Error("Evidence HTTP QA is restricted to the staging Supabase project");
}
if (baseUrl.hostname === PRODUCTION_APP_HOST) {
  throw new Error("Evidence HTTP QA refuses to run against the Production application host");
}
if (target === "local" && !["127.0.0.1", "localhost"].includes(baseUrl.hostname)) {
  throw new Error("QA_TARGET=local requires a localhost QA_BASE_URL");
}
if (target === "staging" && process.env.QA_STAGING_CONFIRM !== "STAGING_ONLY") {
  throw new Error("Set QA_STAGING_CONFIRM=STAGING_ONLY for a Staging HTTP run");
}
if (new TextEncoder().encode(sessionSecret).byteLength < 32) {
  throw new Error("QA_SESSION_SECRET or APP_SESSION_SECRET must match the target app and be at least 32 bytes");
}

let serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
let anonKey = process.env.SUPABASE_ANON_KEY || "";

if (!serviceRole || !anonKey) {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  if (input.trim()) {
    const keys = JSON.parse(input);
    serviceRole = keys.find((item) => item.name === "service_role" && item.type === "legacy")?.api_key || "";
    anonKey = keys.find((item) => item.name === "anon" && item.type === "legacy")?.api_key || "";
  }
}

if (!serviceRole || !anonKey) {
  throw new Error("Staging service_role and anon keys are required via environment or stdin");
}

const supabaseUrl = `https://${projectRef}.supabase.co`;
const supabase = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const runId = `evidence-http-${Date.now()}`;
const batchId = crypto.randomUUID();
const departmentId = crypto.randomUUID();
const department = `__${runId}-department`;
const objectPaths = new Set();
const pdfBytes = new TextEncoder().encode("%PDF-1.4\n% Evidence HTTP QA\n%%EOF");
let batchCreated = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function createSessionCookie(role) {
  const expiresAt = Date.now() + 30 * 60 * 1000;
  const payload = `v2.${expiresAt}.${role}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${cookieName}=${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

async function api(path, { cookie, method = "POST", body } = {}) {
  if (vercelDeployment) {
    const statusMarker = "\n__QA_HTTP_STATUS__";
    const curlArguments = [
      "vercel", "curl", path,
      "--deployment", vercelDeployment,
      "--", "--silent", "--show-error", "--request", method,
      "--write-out", `${statusMarker}%{http_code}`
    ];
    if (cookie) curlArguments.push("--header", `Cookie: ${cookie}`);
    if (body !== undefined) {
      curlArguments.push("--header", "Content-Type: application/json", "--data", JSON.stringify(body));
    }
    const result = spawnSync("npx", curlArguments, { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`Vercel Preview request failed: ${result.stderr || result.stdout}`);
    }
    const markerIndex = result.stdout.lastIndexOf(statusMarker);
    if (markerIndex < 0) throw new Error("Vercel Preview response did not include an HTTP status");
    const responseBody = result.stdout.slice(0, markerIndex);
    const status = Number.parseInt(result.stdout.slice(markerIndex + statusMarker.length), 10);
    const payload = responseBody ? JSON.parse(responseBody) : null;
    return { response: { status }, payload };
  }

  const response = await fetch(new URL(path, baseUrl), {
    method,
    redirect: "manual",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function requestAndUpload(cookie, filename) {
  const create = await api(`/api/report/${batchId}/evidence`, {
    cookie,
    body: {
      action: "create-upload",
      dept: department,
      filename,
      contentType: "application/pdf",
      size: pdfBytes.byteLength
    }
  });
  assert(create.response.status === 200 && create.payload?.upload, `create-upload failed with ${create.response.status}`);
  const upload = create.payload.upload;
  objectPaths.add(upload.path);
  const browserStorage = createClient(upload.supabaseUrl, upload.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const uploaded = await browserStorage.storage
    .from(upload.bucket)
    .uploadToSignedUrl(upload.path, upload.token, pdfBytes, { contentType: "application/pdf" });
  if (uploaded.error) throw uploaded.error;
  return upload.path;
}

async function cleanup() {
  const errors = [];
  const paths = [...objectPaths];
  if (batchCreated) {
    const deleted = await supabase.from("report_batches").delete().eq("id", batchId);
    if (deleted.error) errors.push(`report batch: ${deleted.error.message}`);
  }
  if (paths.length > 0) {
    const removed = await supabase.storage.from("report-evidence").remove(paths);
    if (removed.error) errors.push(`evidence objects: ${removed.error.message}`);
    const outbox = await supabase.from("storage_deletion_outbox").delete().in("object_path", paths);
    if (outbox.error) errors.push(`outbox rows: ${outbox.error.message}`);
  }
  const audit = await supabase.from("audit_events").delete().in("resource_id", [batchId, departmentId]);
  if (audit.error) errors.push(`audit rows: ${audit.error.message}`);
  if (errors.length > 0) throw new Error(`Evidence HTTP QA cleanup failed (${errors.join("; ")})`);
}

const checks = {};
let summary = null;

try {
  const [adminCookie, operatorCookie] = await Promise.all([
    createSessionCookie("admin"),
    createSessionCookie("operator")
  ]);

  const batchInsert = await supabase.from("report_batches").insert({
    id: batchId,
    report_date: "2026-07-14",
    note: `Evidence HTTP QA ${runId}`,
    idempotency_key: crypto.randomUUID()
  });
  if (batchInsert.error) throw batchInsert.error;
  batchCreated = true;
  const departmentInsert = await supabase.from("report_batch_departments").insert({
    id: departmentId,
    report_batch_id: batchId,
    dept_name: department
  });
  if (departmentInsert.error) throw departmentInsert.error;

  const unauthorized = await api(`/api/report/${batchId}/evidence`, {
    body: {
      action: "review",
      dept: department,
      evidenceVersionId: crypto.randomUUID(),
      decision: "approved"
    }
  });
  assert(unauthorized.response.status === 401, `unauthenticated review returned ${unauthorized.response.status}`);
  checks.unauthenticated401 = "passed";

  const operatorForbidden = await api(`/api/report/${batchId}/evidence`, {
    cookie: operatorCookie,
    body: {
      action: "review",
      dept: department,
      evidenceVersionId: crypto.randomUUID(),
      decision: "approved"
    }
  });
  assert(operatorForbidden.response.status === 403, `operator review returned ${operatorForbidden.response.status}`);
  checks.operatorReview403 = "passed";

  const operatorAutoApprove = await api(`/api/report/${batchId}/evidence`, {
    cookie: operatorCookie,
    body: {
      action: "complete-upload",
      dept: department,
      path: `${batchId}/${departmentId}/not-uploaded.pdf`,
      autoApprove: true
    }
  });
  assert(operatorAutoApprove.response.status === 403, `operator auto-approve returned ${operatorAutoApprove.response.status}`);
  checks.operatorAutoApprove403 = "passed";

  const malformedUuid = await api(`/api/report/${batchId}/evidence`, {
    cookie: adminCookie,
    body: {
      action: "review",
      dept: department,
      evidenceVersionId: "not-a-uuid",
      decision: "approved"
    }
  });
  assert(malformedUuid.response.status === 400, `malformed UUID returned ${malformedUuid.response.status}`);
  assert(malformedUuid.payload?.code === "invalid_evidence_version_id", "malformed UUID did not return its stable error code");
  checks.malformedUuid400 = "passed";

  const firstPath = await requestAndUpload(adminCookie, `${runId}-approved.pdf`);
  const firstComplete = await api(`/api/report/${batchId}/evidence`, {
    cookie: adminCookie,
    body: { action: "complete-upload", dept: department, path: firstPath, autoApprove: true }
  });
  assert(firstComplete.response.status === 200, `auto-approve upload returned ${firstComplete.response.status}`);
  assert(firstComplete.payload?.autoApproved === true, "auto-approve did not report success");
  assert(firstComplete.payload?.department?.evidence_review_status === "approved", "auto-approved projection is not approved");
  const firstVersionId = firstComplete.payload.department.current_evidence_version_id;
  assert(firstVersionId, "auto-approved upload did not return a version id");
  checks.autoApprove = "passed";

  const firstRetry = await api(`/api/report/${batchId}/evidence`, {
    cookie: adminCookie,
    body: { action: "complete-upload", dept: department, path: firstPath, autoApprove: true }
  });
  assert(firstRetry.response.status === 200, `completion retry returned ${firstRetry.response.status}`);
  assert(firstRetry.payload?.autoApproved === true, "idempotent auto-approval retry did not preserve success");
  const firstVersions = await supabase
    .from("report_evidence_versions")
    .select("id", { count: "exact", head: true })
    .eq("report_batch_department_id", departmentId)
    .eq("object_path", firstPath);
  if (firstVersions.error) throw firstVersions.error;
  assert(firstVersions.count === 1, "completion retry created a duplicate evidence version");
  const retryAudits = await supabase
    .from("audit_events")
    .select("action")
    .eq("resource_id", departmentId)
    .in("action", ["evidence.upload_completion_retried", "evidence.approval_retried"]);
  if (retryAudits.error) throw retryAudits.error;
  assert(retryAudits.data.some((event) => event.action === "evidence.upload_completion_retried"), "completion retry audit semantics are missing");
  assert(retryAudits.data.some((event) => event.action === "evidence.approval_retried"), "approval retry audit semantics are missing");
  checks.idempotentCompletionRetry = "passed";

  const secondPath = await requestAndUpload(operatorCookie, `${runId}-pending.pdf`);
  const secondComplete = await api(`/api/report/${batchId}/evidence`, {
    cookie: operatorCookie,
    body: { action: "complete-upload", dept: department, path: secondPath, autoApprove: false }
  });
  assert(secondComplete.response.status === 200, `operator completion returned ${secondComplete.response.status}`);
  assert(secondComplete.payload?.autoApproved === false, "ordinary operator upload was reported as auto-approved");
  const secondVersionId = secondComplete.payload?.department?.current_evidence_version_id;
  assert(secondVersionId && secondVersionId !== firstVersionId, "second upload did not become the current version");

  const staleReview = await api(`/api/report/${batchId}/evidence`, {
    cookie: adminCookie,
    body: {
      action: "review",
      dept: department,
      evidenceVersionId: firstVersionId,
      decision: "approved"
    }
  });
  assert(staleReview.response.status === 409, `stale review returned ${staleReview.response.status}`);
  assert(staleReview.payload?.code === "stale_evidence_version", "stale review did not return its stable conflict code");
  checks.staleReview409 = "passed";

  const staleWithdraw = await api(`/api/report/${batchId}/evidence`, {
    cookie: adminCookie,
    method: "DELETE",
    body: { dept: department, evidenceVersionId: firstVersionId, reason: "stale withdrawal must fail" }
  });
  assert(staleWithdraw.response.status === 409, `stale withdrawal returned ${staleWithdraw.response.status}`);
  checks.staleWithdraw409 = "passed";

  const shortRejection = await api(`/api/report/${batchId}/evidence`, {
    cookie: adminCookie,
    body: {
      action: "review",
      dept: department,
      evidenceVersionId: secondVersionId,
      decision: "rejected",
      note: "1234"
    }
  });
  assert(shortRejection.response.status === 400, `short rejection reason returned ${shortRejection.response.status}`);
  checks.rejectionReason400 = "passed";

  const rejected = await api(`/api/report/${batchId}/evidence`, {
    cookie: adminCookie,
    body: {
      action: "review",
      dept: department,
      evidenceVersionId: secondVersionId,
      decision: "rejected",
      note: "Evidence HTTP QA rejection"
    }
  });
  assert(rejected.response.status === 200, `valid rejection returned ${rejected.response.status}`);
  const rejectedRetry = await api(`/api/report/${batchId}/evidence`, {
    cookie: adminCookie,
    body: {
      action: "review",
      dept: department,
      evidenceVersionId: secondVersionId,
      decision: "rejected",
      note: "Evidence HTTP QA rejection"
    }
  });
  assert(rejectedRetry.response.status === 200, `idempotent review retry returned ${rejectedRetry.response.status}`);
  const rejectedEvents = await supabase
    .from("report_evidence_status_events")
    .select("id", { count: "exact", head: true })
    .eq("evidence_version_id", secondVersionId)
    .eq("status", "rejected");
  if (rejectedEvents.error) throw rejectedEvents.error;
  assert(rejectedEvents.count === 1, "idempotent review retry created duplicate status events");
  checks.idempotentReviewRetry = "passed";

  const operatorWithdraw = await api(`/api/report/${batchId}/evidence`, {
    cookie: operatorCookie,
    method: "DELETE",
    body: { dept: department, evidenceVersionId: secondVersionId, reason: "operator must not withdraw" }
  });
  assert(operatorWithdraw.response.status === 403, `operator withdrawal returned ${operatorWithdraw.response.status}`);
  checks.operatorWithdraw403 = "passed";

  const withdrawn = await api(`/api/report/${batchId}/evidence`, {
    cookie: adminCookie,
    method: "DELETE",
    body: { dept: department, evidenceVersionId: secondVersionId, reason: "Evidence HTTP QA cleanup" }
  });
  assert(withdrawn.response.status === 200, `valid withdrawal returned ${withdrawn.response.status}`);
  const withdrawnRetry = await api(`/api/report/${batchId}/evidence`, {
    cookie: adminCookie,
    method: "DELETE",
    body: { dept: department, evidenceVersionId: secondVersionId, reason: "Evidence HTTP QA cleanup" }
  });
  assert(withdrawnRetry.response.status === 200, `idempotent withdrawal retry returned ${withdrawnRetry.response.status}`);
  checks.idempotentWithdrawRetry = "passed";

  summary = {
    target,
    baseOrigin: baseUrl.origin,
    projectRef,
    checks
  };
} finally {
  await cleanup();
}

console.log(JSON.stringify({ ...summary, cleanup: "passed" }, null, 2));
