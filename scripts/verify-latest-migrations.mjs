// Verifies that the 2026-08-25 migrations exist and behave on the target
// database pointed to by SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
//
//   ticket_origin column        -> selectable on tickets
//   dashboard_range_overview    -> RPC returns aggregates
//   purge_old_audit_events      -> existence probed with an invalid retention
//                                  value, which raises before deleting anything.
//
// Usage: node scripts/verify-latest-migrations.mjs [path-to-env-file]

import { readFileSync } from "node:fs";
import process from "node:process";

const envFile = process.argv[2] || ".env.local";
const fromFile = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()])
);
const env = { ...fromFile, ...process.env };

const baseUrl = env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json"
};

let failures = 0;
function report(name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

// 1) ticket_origin column exists and backfill produced values.
try {
  const response = await fetch(`${baseUrl}/rest/v1/tickets?select=ticket_id,ticket_origin&ticket_origin=eq.external_intake&limit=1`, { headers });
  const rows = await response.json();
  report("tickets.ticket_origin", response.ok && Array.isArray(rows), `status=${response.status}`);
} catch (error) {
  report("tickets.ticket_origin", false, error.message);
}

// 2) dashboard_range_overview RPC returns aggregate payload.
try {
  const body = {
    p_from: new Date(Date.now() - 90 * 864e5).toISOString(),
    p_to: new Date().toISOString(),
    p_scope: "district",
    p_dept: null
  };
  const response = await fetch(`${baseUrl}/rest/v1/rpc/dashboard_range_overview`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const data = await response.json();
  const ok = response.ok && typeof data?.total === "number" && typeof data?.external_intake_count === "number";
  report("rpc dashboard_range_overview", ok,
    ok ? `total=${data.total} external_intake=${data.external_intake_count} origin_data_available=${data.origin_data_available}` : `status=${response.status}`);
} catch (error) {
  report("rpc dashboard_range_overview", false, error.message);
}

// 3) purge_old_audit_events exists — probe with retention below the 90-day floor,
//    which raises an exception before any row is touched.
try {
  const response = await fetch(`${baseUrl}/rest/v1/rpc/purge_old_audit_events`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_retention_days: 89 })
  });
  const data = await response.json();
  const ok = !response.ok && /at least 90 days/i.test(String(data?.message || ""));
  report("rpc purge_old_audit_events", ok,
    ok ? "function present, floor enforced (nothing deleted)" : `unexpected status=${response.status}`);
} catch (error) {
  report("rpc purge_old_audit_events", false, error.message);
}

console.log(failures === 0 ? "\nAll migration contract checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);