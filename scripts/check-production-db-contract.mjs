import process from "node:process";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const PRODUCTION_PROJECT_REF = "zllbfazkhrvlfutehkyh";
const EXPECTED_PRODUCTION_HOST = `${PRODUCTION_PROJECT_REF}.supabase.co`;

nextEnv.loadEnvConfig(process.cwd());

function requireValue(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function distanceMeters(a, b) {
  const earthRadius = 6371008.8;
  const lat1 = Number(a.lat) * Math.PI / 180;
  const lat2 = Number(b.lat) * Math.PI / 180;
  const deltaLat = (Number(b.lat) - Number(a.lat)) * Math.PI / 180;
  const deltaLng = (Number(b.lng) - Number(a.lng)) * Math.PI / 180;
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

if (process.env.PRODUCTION_PREFLIGHT_CONFIRM !== PRODUCTION_PROJECT_REF) {
  throw new Error(`Set PRODUCTION_PREFLIGHT_CONFIRM=${PRODUCTION_PROJECT_REF}`);
}

const supabaseUrl = new URL(requireValue("SUPABASE_URL"));
if (supabaseUrl.protocol !== "https:" || supabaseUrl.hostname !== EXPECTED_PRODUCTION_HOST) {
  throw new Error(
    `Production DB contract check refuses Supabase target ${supabaseUrl.hostname}; expected ${EXPECTED_PRODUCTION_HOST}`
  );
}

const serviceRoleKey = requireValue("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = requireValue("SUPABASE_ANON_KEY");
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl.origin, serviceRoleKey, clientOptions);
const anon = createClient(supabaseUrl.origin, anonKey, clientOptions);

const results = {};
for (const periodDays of [30, 90, 180]) {
  const overview = await admin.rpc("analytics_overview", { p_days: periodDays });
  const first = await admin.rpc("analytics_radius_hotspots", {
    p_days: periodDays,
    p_radius_m: 500,
    p_limit: 8
  });
  const second = await admin.rpc("analytics_radius_hotspots", {
    p_days: periodDays,
    p_radius_m: 500,
    p_limit: 8
  });

  if (overview.error) {
    throw new Error(`Production analytics_overview ${periodDays}d failed: ${overview.error.message}`);
  }
  if (first.error) {
    throw new Error(`Production analytics_radius_hotspots ${periodDays}d failed: ${first.error.message}`);
  }
  if (second.error) {
    throw new Error(`Production analytics_radius_hotspots retry ${periodDays}d failed: ${second.error.message}`);
  }

  assert(Array.isArray(first.data), `${periodDays}d hotspots payload is not an array`);
  assert(JSON.stringify(first.data) === JSON.stringify(second.data), `${periodDays}d hotspot result is not deterministic`);
  assert(first.data.length <= 8, `${periodDays}d returned more than eight hotspots`);

  const createdCount = Number(overview.data?.summary?.createdCount || 0);
  assert(createdCount === 0 || first.data.length > 0, `${periodDays}d has received tickets but no hotspots`);

  for (const [index, row] of first.data.entries()) {
    assert(Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)), `${periodDays}d hotspot has invalid coordinates`);
    assert(row.radiusMeters === 500, `${periodDays}d hotspot radius is not 500 metres`);
    assert(Number.isInteger(row.totalCount) && row.totalCount >= 1, `${periodDays}d hotspot has invalid totalCount`);
    assert(Number.isInteger(row.pendingCount) && row.pendingCount >= 0, `${periodDays}d hotspot has invalid pendingCount`);
    assert(row.closedCount === row.totalCount - row.pendingCount, `${periodDays}d hotspot counts do not reconcile`);
    assert(Number(row.sharePercent) >= 0 && Number(row.sharePercent) <= 100, `${periodDays}d hotspot share is out of range`);

    for (const prior of first.data.slice(0, index)) {
      assert(distanceMeters(row, prior) >= 990, `${periodDays}d hotspot circles overlap`);
    }
  }

  results[`${periodDays}d`] = {
    createdCount,
    hotspots: first.data.length,
    topCount: first.data[0]?.totalCount || 0
  };
}

const anonymousAttempt = await anon.rpc("analytics_radius_hotspots", {
  p_days: 30,
  p_radius_m: 500,
  p_limit: 8
});
assert(Boolean(anonymousAttempt.error), "Anonymous role unexpectedly executed analytics_radius_hotspots");
assert(
  ["42501", "PGRST202"].includes(anonymousAttempt.error.code),
  `Anonymous analytics denial returned unexpected code ${anonymousAttempt.error.code || "none"}`
);

const operations = await admin.rpc("operations_health_snapshot");
if (operations.error) {
  throw new Error(`Production operations health failed: ${operations.error.message}`);
}

const operationSnapshot = operations.data || {};
assert(Number(operationSnapshot.outbox?.dead || 0) === 0, "Production has dead storage deletion jobs");
assert(Number(operationSnapshot.outbox?.staleLeases || 0) === 0, "Production has stale storage deletion leases");
assert(Number(operationSnapshot.outbox?.pending || 0) === 0, "Production has pending storage deletion jobs");
assert(Number(operationSnapshot.outbox?.processing || 0) === 0, "Production has processing storage deletion jobs");
assert(Number(operationSnapshot.outbox?.failed || 0) === 0, "Production has failed storage deletion jobs");
assert(Number(operationSnapshot.imports?.active || 0) === 0, "Production has an active import job");
assert(Number(operationSnapshot.imports?.staleActive || 0) === 0, "Production has stale import jobs");

console.log(JSON.stringify({
  ok: true,
  projectRef: PRODUCTION_PROJECT_REF,
  analytics: results,
  anonymousDenied: true,
  operations: {
    deadOutbox: Number(operationSnapshot.outbox?.dead || 0),
    pendingOutbox: Number(operationSnapshot.outbox?.pending || 0),
    processingOutbox: Number(operationSnapshot.outbox?.processing || 0),
    failedOutbox: Number(operationSnapshot.outbox?.failed || 0),
    staleLeases: Number(operationSnapshot.outbox?.staleLeases || 0),
    activeImports: Number(operationSnapshot.imports?.active || 0),
    staleImports: Number(operationSnapshot.imports?.staleActive || 0)
  }
}, null, 2));
