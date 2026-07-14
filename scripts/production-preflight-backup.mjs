import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import process from "node:process";

import nextEnv from "@next/env";

const PRODUCTION_HOST = "traffy-track.vercel.app";
const PRODUCTION_PROJECT_REF = "zllbfazkhrvlfutehkyh";
const OUTPUT_PATH = "/tmp/tf-production-predeploy.zip";

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

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attribute(tag, name) {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;
}

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

const pageStatuses = {};
for (const pathname of ["/dashboard", "/cases", "/report", "/admin"]) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: { Cookie: sessionCookie },
    redirect: "manual"
  });
  pageStatuses[pathname] = response.status;
  if (response.status !== 200) throw new Error(`Production page smoke failed for ${pathname} (${response.status})`);
}
console.log(JSON.stringify({ pageStatuses }));

if (process.env.PRODUCTION_SKIP_BACKUP === "1") process.exit(0);

const backupResponse = await fetch(`${baseUrl}/api/admin/backup/export`, {
  method: "POST",
  headers: { Cookie: sessionCookie }
});
if (!backupResponse.ok) {
  throw new Error(`Production backup failed (${backupResponse.status})`);
}
const data = Buffer.from(await backupResponse.arrayBuffer());
await writeFile(OUTPUT_PATH, data);

console.log(JSON.stringify({
  backupHttp: backupResponse.status,
  outputPath: OUTPUT_PATH,
  bytes: data.length,
  sha256: createHash("sha256").update(data).digest("hex"),
  rows: Number(backupResponse.headers.get("x-backup-table-rows")),
  storageObjects: Number(backupResponse.headers.get("x-backup-storage-objects"))
}));
