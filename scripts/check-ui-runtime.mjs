import { createHmac } from "node:crypto";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:3000";
const secret = process.env.APP_SESSION_SECRET || "";
const cookieName = process.env.APP_AUTH_COOKIE || "citydata-passcode";
if (Buffer.byteLength(secret) < 32) throw new Error("APP_SESSION_SECRET must be at least 32 bytes");

function sessionCookie(role) {
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const payload = `v2.${expiresAt}.${role}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${cookieName}=${payload}.${signature}`;
}

async function request(path, role, redirect = "follow") {
  return fetch(new URL(path, baseUrl), {
    headers: role ? { cookie: sessionCookie(role) } : {},
    redirect
  });
}

async function page(path, expectedText, role = "admin") {
  const response = await request(path, role);
  const body = await response.text();
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  if (!body.includes(expectedText)) throw new Error(`${path} did not render ${expectedText}`);
  if (/โหลด.+ไม่ได้ชั่วคราว|unavailable/i.test(body)) throw new Error(`${path} rendered an unavailable state`);
  return body;
}

const unauthenticated = await request("/dashboard", null, "manual");
if (unauthenticated.status < 300 || unauthenticated.status >= 400) {
  throw new Error("Unauthenticated dashboard did not redirect");
}

const dashboard = await page("/dashboard", "งานที่ต้องทำวันนี้");
const cases = await page("/cases", "ทะเบียนเรื่อง");
const reports = await page("/report", "รอบรายงาน");
await page("/import", "นำเข้าข้อมูล");
await page("/map", "แผนที่จุดร้องเรียน");
await page("/admin", "ผู้ดูแลระบบ");

const caseMatch = cases.match(/href="\/cases\/([^"?]+)"/);
if (caseMatch) await page(`/cases/${caseMatch[1]}`, "หน่วยงานในข้อมูล");

const reportMatch = (dashboard + reports).match(/\/report\/([a-f0-9-]{36})/i);
if (reportMatch) await page(`/report/${reportMatch[1]}`, "สถานะ:");

const operatorAdmin = await request("/admin", "operator", "manual");
if (operatorAdmin.status < 300 || operatorAdmin.status >= 400) {
  throw new Error("Operator was not redirected away from Admin");
}

const health = await request("/api/system/health", "admin");
const healthBody = await health.json();
if (!health.ok || healthBody.status !== "ok") throw new Error("Authenticated health check failed");

console.log(JSON.stringify({
  baseUrl,
  checks: {
    unauthenticatedRedirect: "passed",
    dashboardActionCenter: "passed",
    casesAndAssignmentHistory: caseMatch ? "passed" : "no-case-link",
    reportLifecycle: reportMatch ? "passed" : "no-action-center-report-link",
    importMapReportAdminPages: "passed",
    operatorAdminDenial: "passed",
    authenticatedHealth: "passed"
  }
}, null, 2));
