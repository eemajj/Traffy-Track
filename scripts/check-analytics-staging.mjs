import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "pyyoysdcedaskohiocdg";
const projectRef = process.env.SUPABASE_PROJECT_REF;
if (projectRef !== STAGING_PROJECT_REF) {
  throw new Error("Analytics QA is restricted to the Staging project");
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const apiKeys = JSON.parse(input);
const serviceRole = apiKeys.find((item) => item.name === "service_role" && item.type === "legacy")?.api_key;
const anonKey = apiKeys.find((item) => item.name === "anon" && item.type === "legacy")?.api_key;
if (!serviceRole || !anonKey) throw new Error("Staging legacy API keys were not found");

const url = `https://${projectRef}.supabase.co`;
const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function distanceMeters(a, b) {
  const radius = 6371008.8;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * Math.PI / 180;
  const deltaLng = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

const results = {};
for (const periodDays of [30, 90, 180]) {
  const startedAt = performance.now();
  const overview = await admin.rpc("analytics_overview", { p_days: periodDays });
  if (overview.error) throw overview.error;
  const first = await admin.rpc("analytics_radius_hotspots", {
    p_days: periodDays,
    p_radius_m: 500,
    p_limit: 8
  });
  if (first.error) throw first.error;
  const second = await admin.rpc("analytics_radius_hotspots", {
    p_days: periodDays,
    p_radius_m: 500,
    p_limit: 8
  });
  if (second.error) throw second.error;

  assert(JSON.stringify(first.data) === JSON.stringify(second.data), `${periodDays}d result is not deterministic`);
  assert(Array.isArray(first.data) && first.data.length <= 8, `${periodDays}d returned too many hotspots`);
  assert(overview.data?.summary?.createdCount === 0 || first.data.length > 0, `${periodDays}d has received tickets but no hotspots`);

  for (const [index, row] of first.data.entries()) {
    assert(Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)), `${periodDays}d hotspot has invalid coordinates`);
    assert(row.radiusMeters === 500, `${periodDays}d hotspot has the wrong radius`);
    assert(Number.isInteger(row.totalCount) && row.totalCount >= 1, `${periodDays}d hotspot has invalid totalCount`);
    assert(Number.isInteger(row.pendingCount) && row.pendingCount >= 0, `${periodDays}d hotspot has invalid pendingCount`);
    assert(row.closedCount === row.totalCount - row.pendingCount, `${periodDays}d closedCount does not reconcile`);
    assert(row.sharePercent >= 0 && row.sharePercent <= 100, `${periodDays}d sharePercent is out of range`);
    for (const prior of first.data.slice(0, index)) {
      assert(distanceMeters(row, prior) >= 990, `${periodDays}d hotspot circles overlap`);
    }
  }

  results[`${periodDays}d`] = {
    createdCount: overview.data?.summary?.createdCount || 0,
    hotspots: first.data.length,
    topCount: first.data[0]?.totalCount || 0,
    durationMs: Math.round(performance.now() - startedAt)
  };
}

const clamped = await admin.rpc("analytics_radius_hotspots", { p_days: 999, p_radius_m: 1, p_limit: 0 });
if (clamped.error) throw clamped.error;
assert(clamped.data.length <= 1, "result limit was not clamped to one");
assert(clamped.data.every((row) => row.radiusMeters === 100), "radius was not clamped to 100 metres");

const anonymousAttempt = await anon.rpc("analytics_radius_hotspots", {
  p_days: 30,
  p_radius_m: 500,
  p_limit: 8
});
assert(Boolean(anonymousAttempt.error), "anonymous role unexpectedly executed analytics_radius_hotspots");

console.log(JSON.stringify({ ok: true, results, anonymousDenied: true }, null, 2));
