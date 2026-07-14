import process from "node:process";

import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3000";
const passcode = process.env.APP_ADMIN_PASSCODE || process.env.APP_PASSCODE;
if (!passcode) throw new Error("An admin passcode is required for Analytics HTTP QA");

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

const loginPage = await fetch(`${baseUrl}/login`);
if (!loginPage.ok) throw new Error(`Could not load login page (${loginPage.status})`);
const loginHtml = await loginPage.text();
const form = new FormData();
for (const match of loginHtml.matchAll(/<input\b[^>]*>/g)) {
  const tag = match[0];
  if (attribute(tag, "type") !== "hidden") continue;
  const name = attribute(tag, "name");
  if (name) form.append(decodeHtml(name), decodeHtml(attribute(tag, "value") || ""));
}
form.set("passcode", passcode);
form.set("next", "/analytics?period=180");

const login = await fetch(`${baseUrl}/login`, {
  method: "POST",
  body: form,
  redirect: "manual",
  headers: { Origin: baseUrl, Referer: `${baseUrl}/login` }
});
const cookieName = process.env.APP_AUTH_COOKIE || "citydata-passcode";
const sessionCookie = (login.headers.getSetCookie?.() || [])
  .map((value) => value.split(";", 1)[0])
  .find((value) => value.startsWith(`${cookieName}=`));
if (!sessionCookie) throw new Error(`Login did not issue a session (${login.status})`);

const analytics = await fetch(`${baseUrl}/analytics?period=180`, {
  headers: { Cookie: sessionCookie }
});
const analyticsHtml = await analytics.text();
if (!analytics.ok) throw new Error(`Analytics page failed (${analytics.status})`);
if (!analyticsHtml.includes("จุดรับเรื่องที่กระจุกตัว")) throw new Error("Analytics hotspot section was not rendered");
if (!analyticsHtml.includes("ดูตำแหน่งและวงรัศมีบนแผนที่")) throw new Error("Analytics hotspot map link was not rendered");

const encodedMapHref = analyticsHtml.match(/href="([^"]*focusLat=[^"]+)"/)?.[1];
if (!encodedMapHref) throw new Error("Could not find a hotspot map URL");
const mapHref = decodeHtml(encodedMapHref);
const mapPage = await fetch(new URL(mapHref, baseUrl), { headers: { Cookie: sessionCookie } });
const mapHtml = await mapPage.text();
if (!mapPage.ok) throw new Error(`Focused map page failed (${mapPage.status})`);
if (!mapHtml.includes("ภายในวงรัศมี")) throw new Error("Focused map period/radius context was not rendered");

console.log(JSON.stringify({
  ok: true,
  analyticsStatus: analytics.status,
  focusedMapStatus: mapPage.status
}));
