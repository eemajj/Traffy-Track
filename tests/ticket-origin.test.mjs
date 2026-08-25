import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const originMigrationUrl = new URL(
  "../supabase/migrations/20260825120000_ticket_origin_flag.sql",
  import.meta.url
);
const normalizeUrl = new URL("../lib/import/normalize.ts", import.meta.url);

test("ticket origin migration adds flag, derives it at apply time, and backfills safely", async () => {
  const sql = await readFile(originMigrationUrl, "utf8");

  assert.match(sql, /alter table public\.tickets add column if not exists ticket_origin text/);
  assert.match(sql, /check \(ticket_origin in \('external_intake', 'district_transferred'\)\)/);
  assert.match(sql, /create or replace function public\.derive_ticket_origin/);
  assert.match(sql, /immutable/);
  // Absence of every district signal => external intake.
  assert.match(sql, /foreach v_org_entry in array p_org_list loop/);
  assert.match(sql, /return 'external_intake'/);
  assert.match(sql, /update public\.tickets\s+set ticket_origin = public\.derive_ticket_origin\(org_list, dept_list, district, state\)\s+where ticket_origin is null/);
  assert.match(sql, /create index if not exists idx_tickets_external_intake[\s\S]+where ticket_origin = 'external_intake'/);
  // Apply RPC stays lease-verified and now upserts the derived origin.
  assert.match(sql, /create or replace function public\.apply_claimed_import_batch/);
  assert.match(sql, /public\.derive_ticket_origin\(org_list, dept_list, district, state\)/);
  assert.match(sql, /ticket_origin = excluded\.ticket_origin/);
  assert.match(sql, /revoke execute on function public\.apply_claimed_import_batch/);
  assert.match(sql, /grant execute on function public\.apply_claimed_import_batch[\s\S]+to service_role/);
});

test("SQL origin derivation mirrors the TypeScript intake filter signals", async () => {
  const [sql, normalize] = await Promise.all([
    readFile(originMigrationUrl, "utf8"),
    readFile(normalizeUrl, "utf8")
  ]);

  assert.match(normalize, /isDistrictRelatedTicket/);
  assert.match(normalize, /entry\.includes\(districtName\) \|\| entry\.includes\("ทวีวัฒนา"\) \|\| entry\.startsWith\("ฝ่าย"\)/);
  // Same district keyword used by both implementations.
  assert.match(sql, /ทวีวัฒนา/);
  assert.match(normalize, /ทวีวัฒนา/);
});