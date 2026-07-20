import { createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import process from "node:process";

import nextEnv from "@next/env";
import { decodeHtmlAttribute as decodeHtml, encryptBackupArtifact as encryptArtifact, getHtmlAttribute as attribute } from "./lib/backup-transport.mjs";

const PRODUCTION_HOST = "traffy-track.vercel.app";
const PRODUCTION_PROJECT_REF = "zllbfazkhrvlfutehkyh";
const OUTPUT_PATH = "/tmp/tf-production-predeploy.zip";
const METADATA_PATH = "/tmp/tf-production-predeploy.manifest.json";
const ENCRYPTED_OUTPUT_PATH = `${OUTPUT_PATH}.enc`;
nextEnv.loadEnvConfig(process.cwd());

if (process.env.PRODUCTION_PREFLIGHT_CONFIRM !== PRODUCTION_PROJECT_REF) {
  throw new Error(`Set PRODUCTION_PREFLIGHT_CONFIRM=${PRODUCTION_PROJECT_REF}`);
}

const passcode = process.env.APP_ADMIN_PASSCODE || process.env.APP_PASSCODE;
if (!passcode) throw new Error("A Production admin passcode is required for preflight backup");

const baseUrl = `https://${PRODUCTION_HOST}`;
const loginPage = await fetch(`${baseUrl}/login`);
if (!loginPage.ok) throw new Error(`Could not load Production login (${loginPage.status})`);
const html = await loginPage.text();

const form = new FormData();
for (const match of html.matchAll(/<input\b[^>]*>/g)) {
  const tag = match[0];
  if (attribute(tag, "type") !== "hidden") continue;
  const name = attribute(tag, "name");
  if (name) form.append(decodeHtml(name), decodeHtml(attribute(tag, "value") || ""));
}
form.set("passcode", passcode);
form.set("next", "/dashboard");

const login = await fetch(`${baseUrl}/login`, {
  method: "POST",
  body: form,
  redirect: "manual",
  headers: { Origin: baseUrl, Referer: `${baseUrl}/login` }
});
const cookieName = process.env.APP_AUTH_COOKIE || "citydata-passcode";
const setCookies = login.headers.getSetCookie?.() || [];
const sessionCookie = setCookies
  .map((value) => value.split(";", 1)[0])
  .find((value) => value.startsWith(`${cookieName}=`));
if (!sessionCookie) throw new Error(`Production login did not issue an authenticated session (${login.status})`);

const healthResponse = await fetch(`${baseUrl}/api/system/health`, {
  headers: { Cookie: sessionCookie }
});
const health = await healthResponse.json();
if (healthResponse.status !== 200 || health.status !== "ok") {
  throw new Error(`Production health baseline is not ok (${healthResponse.status}/${health.status || "unknown"})`);
}

console.log(JSON.stringify({
  healthHttp: healthResponse.status,
  status: health.status,
  checks: health.checks,
  tickets: health.tickets,
  latestImport: health.latestImport?.id || null
}));

const pageExpectations = new Map([
  ["/dashboard", "งานที่ต้องทำวันนี้"],
  ["/cases", "ทะเบียนเรื่อง"],
  ["/map", "แผนที่จุดร้องเรียน"],
  ["/report", "รอบรายงาน"],
  ["/analytics?period=180", "วิเคราะห์แนวโน้ม"],
  ["/import", "นำเข้าข้อมูล"],
  ["/admin", "ผู้ดูแลระบบ"]
]);
const pageStatuses = {};
for (const [pathname, expectedText] of pageExpectations) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { Cookie: sessionCookie },
    redirect: "manual"
  });
  pageStatuses[pathname] = response.status;
  if (response.status !== 200) throw new Error(`Production page smoke failed for ${pathname} (${response.status})`);
  const body = await response.text();
  if (!body.includes(expectedText)) throw new Error(`Production page smoke did not render ${expectedText} for ${pathname}`);
}
console.log(JSON.stringify({ pageStatuses }));

const caseSmokeId = process.env.PRODUCTION_CASE_SMOKE_ID;
const expectedPhotoUrl = process.env.PRODUCTION_EXPECT_PHOTO_URL;
if (caseSmokeId) {
  const caseResponse = await fetch(`${baseUrl}/cases/${encodeURIComponent(caseSmokeId)}`, {
    headers: { Cookie: sessionCookie },
    redirect: "manual"
  });
  const caseBody = await caseResponse.text();
  if (caseResponse.status !== 200 || !caseBody.includes(caseSmokeId)) {
    throw new Error(`Production case smoke failed for ${caseSmokeId} (${caseResponse.status})`);
  }
  if (expectedPhotoUrl && !caseBody.includes(expectedPhotoUrl)) {
    throw new Error(`Production case smoke did not render the canonical photo URL for ${caseSmokeId}`);
  }
  if (expectedPhotoUrl && !caseBody.includes("ภาพจากระบบ CityData")) {
    throw new Error(`Production case smoke did not render the inline photo panel for ${caseSmokeId}`);
  }
  if (caseBody.includes("traffy_public_bucket/%7Bhttps")) {
    throw new Error(`Production case smoke still rendered a wrapped CityData photo URL for ${caseSmokeId}`);
  }
  console.log(JSON.stringify({ caseSmokeId, caseHttp: caseResponse.status, canonicalPhotoUrl: Boolean(expectedPhotoUrl) }));
}

const workflowResponse = await fetch(`${baseUrl}/api/workflow/actions`, {
  headers: { Cookie: sessionCookie }
});
const workflow = await workflowResponse.json();
if (workflowResponse.status !== 200 || !Array.isArray(workflow.items)) {
  throw new Error(`Production workflow action API failed (${workflowResponse.status})`);
}

const retiredAssignmentEndpoints = [
  "/api/workflow/assign",
  "/api/workflow/triage",
  "/api/workflow/tickets/__retired__/history"
];
const retiredAssignmentStatuses = {};
for (const pathname of retiredAssignmentEndpoints) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { Cookie: sessionCookie },
    redirect: "manual"
  });
  retiredAssignmentStatuses[pathname] = response.status;
  if (response.status !== 404) {
    throw new Error(`Retired assignment endpoint is still reachable at ${pathname} (${response.status})`);
  }
}

const operationsGuardResponse = await fetch(`${baseUrl}/api/admin/operations`, {
  method: "POST",
  headers: { Cookie: sessionCookie, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "invalid-smoke-check" })
});
if (operationsGuardResponse.status !== 400) {
  throw new Error(`Production operations validation guard failed (${operationsGuardResponse.status})`);
}
console.log(JSON.stringify({
  workflowActions: workflow.items.length,
  retiredAssignmentStatuses,
  operationsValidationGuard: operationsGuardResponse.status
}));

if (process.env.PRODUCTION_SKIP_BACKUP === "1") process.exit(0);

const backupResponse = await fetch(`${baseUrl}/api/admin/backup/export`, {
  method: "POST",
  headers: { Cookie: sessionCookie }
});
if (!backupResponse.ok) {
  throw new Error(`Production backup failed (${backupResponse.status})`);
}
const data = Buffer.from(await backupResponse.arrayBuffer());
const responseSha256 = backupResponse.headers.get("x-backup-sha256");
const plaintextSha256 = createHash("sha256").update(data).digest("hex");
if (responseSha256 && responseSha256 !== plaintextSha256) {
  throw new Error("Production backup checksum did not match the server response");
}
if (!responseSha256 && process.env.PRODUCTION_ALLOW_LEGACY_BACKUP_HEADERS !== "1") {
  throw new Error("Production backup response has no checksum header; set PRODUCTION_ALLOW_LEGACY_BACKUP_HEADERS=1 only for a pre-upgrade bootstrap backup");
}

const passphraseFile = process.env.BACKUP_ENCRYPTION_PASSPHRASE_FILE || "";
const encryptionPassphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE
  || (passphraseFile ? (await readFile(passphraseFile, "utf8")).trim() : "");
let artifact = data;
let outputPath = OUTPUT_PATH;
if (encryptionPassphrase) {
  artifact = await encryptArtifact(data, encryptionPassphrase);
  outputPath = ENCRYPTED_OUTPUT_PATH;
  await writeFile(outputPath, artifact, { mode: 0o600 });
  await unlink(OUTPUT_PATH).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
  });
} else {
  await writeFile(outputPath, artifact, { mode: 0o600 });
}

const generatedAt = new Date().toISOString();
const retentionDays = Number(backupResponse.headers.get("x-backup-retention-days")) || 30;
const metadata = {
  format: "tf-backup-artifact-v1",
  backupId: backupResponse.headers.get("x-backup-id"),
  generatedAt,
  outputPath,
  encrypted: Boolean(encryptionPassphrase),
  encryptionFormat: encryptionPassphrase ? "tf-backup-encrypted-v1" : null,
  plaintextSha256,
  serverChecksumVerified: Boolean(responseSha256),
  artifactSha256: createHash("sha256").update(artifact).digest("hex"),
  bytes: artifact.length,
  plaintextBytes: data.length,
  retentionDays,
  retainUntil: backupResponse.headers.get("x-backup-retain-until")
    || new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString(),
  rows: Number(backupResponse.headers.get("x-backup-table-rows")),
  storageObjects: Number(backupResponse.headers.get("x-backup-storage-objects"))
};
await writeFile(METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });

console.log(JSON.stringify({
  backupHttp: backupResponse.status,
  metadataPath: METADATA_PATH,
  ...metadata
}));
