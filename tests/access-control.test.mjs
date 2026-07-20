import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ACCESS_PRESETS,
  getFirstAllowedPath,
  getRoutePermission,
  hasPermission
} from "../lib/access-permissions.ts";
import {
  createIdentitySessionCookieValue,
  getSessionClaims
} from "../lib/session.ts";

const migrationUrl = new URL(
  "../supabase/migrations/20260715190000_passcode_profile_access_control.sql",
  import.meta.url
);

test("executive preset only opens overview, analytics, and map", () => {
  const claims = { role: "operator", permissions: ACCESS_PRESETS.executive.permissions };
  assert.equal(hasPermission(claims, "dashboard:view"), true);
  assert.equal(hasPermission(claims, "analytics:view"), true);
  assert.equal(hasPermission(claims, "analytics:export"), true);
  assert.equal(hasPermission(claims, "map:view"), true);
  assert.equal(hasPermission(claims, "cases:view"), false);
  assert.equal(hasPermission(claims, "admin:manage"), false);
  assert.equal(getFirstAllowedPath(claims), "/dashboard");
  assert.equal(getRoutePermission("/analytics?period=90".split("?")[0]), "analytics:view");
});

test("identity sessions preserve person, role label, and scoped permissions", async () => {
  const previousSecret = process.env.APP_SESSION_SECRET;
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-longer-than-32-bytes";
  try {
    const token = await createIdentitySessionCookieValue({
      identityId: "ea6af502-1aa4-4bf6-8180-a37c89d943c6",
      displayName: "นางสาวทดสอบ ระบบ",
      position: "ผู้ช่วยผู้อำนวยการเขต",
      roleLabel: "ผู้บริหารเขต",
      permissions: [...ACCESS_PRESETS.executive.permissions],
      isAdmin: false,
      accessVersion: 3
    }, 60);
    const claims = await getSessionClaims(token);
    assert.equal(claims?.version, "v3");
    assert.equal(claims?.displayName, "นางสาวทดสอบ ระบบ");
    assert.equal(claims?.roleLabel, "ผู้บริหารเขต");
    assert.deepEqual(claims?.permissions, ACCESS_PRESETS.executive.permissions);
    assert.equal(claims?.accessVersion, 3);
  } finally {
    if (previousSecret === undefined) delete process.env.APP_SESSION_SECRET;
    else process.env.APP_SESSION_SECRET = previousSecret;
  }
});

test("passcode profile storage is hashed, service-role-only, and versioned", async () => {
  const [migration, login, proxy, api, panel] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(new URL("../app/login/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../proxy.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/passcode-profiles/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/passcode-access-panel.tsx", import.meta.url), "utf8")
  ]);

  assert.match(migration, /create table if not exists public\.passcode_profiles/);
  assert.match(migration, /passcode_digest text not null unique/);
  assert.match(migration, /access_version integer not null default 1/);
  assert.match(migration, /bump_passcode_profile_access_version/);
  assert.match(migration, /revoke all privileges[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete[\s\S]+to service_role/);
  assert.doesNotMatch(migration, /passcode\s+text/i);
  assert.match(login, /findPasscodeProfile/);
  assert.match(login, /createIdentitySessionCookieValue/);
  assert.match(proxy, /isIdentitySessionCurrent/);
  assert.match(proxy, /getRoutePermission/);
  assert.match(api, /requireApiPermission\("admin:access"\)/);
  assert.match(api, /ไม่สามารถลบ Passcode ที่กำลังใช้งานอยู่ได้/);
  assert.match(api, /ผู้ดูแลระบบคนสุดท้าย/);
  assert.match(panel, /ผู้บริหารเขต — ภาพรวม วิเคราะห์ แผนที่/);
  assert.match(panel, /ระบบเก็บเฉพาะค่า hash/);
});

test("backup and restore include passcode profiles without erasing old-backup access", async () => {
  const [migration, admin, restore] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(new URL("../lib/admin/runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/restore-backup.mjs", import.meta.url), "utf8")
  ]);
  assert.match(migration, /'passcode_profiles'/);
  assert.match(admin, /"passcode_profiles"/);
  assert.match(restore, /table === "passcode_profiles" && !backedUpTables\.has\(table\)/);
});
