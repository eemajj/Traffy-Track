import assert from "node:assert/strict";
import test from "node:test";

import { readFile } from "node:fs/promises";

import { isCronAuthorizationValid } from "../lib/cron-auth.ts";
import {
  GENERATED_EXPORT_RETENTION_MS,
  IMPORT_MAX_BYTES,
  isStorageObjectPastRetention,
  REPORT_EXPORT_MAX_BYTES,
  STORAGE_FREE_TIER_MAX_BYTES,
  TEMP_IMPORT_RETENTION_MS
} from "../lib/maintenance-policy.ts";

test("cron authorization fails closed without a configured secret", () => {
  assert.equal(isCronAuthorizationValid("Bearer undefined", ""), false);
  assert.equal(isCronAuthorizationValid(null, "daily-secret"), false);
  assert.equal(isCronAuthorizationValid("Bearer wrong-secret", "daily-secret"), false);
  assert.equal(isCronAuthorizationValid("Bearer daily-secret", "daily-secret"), true);
});

test("storage retention uses the newest valid object timestamp", () => {
  const cutoffMs = Date.parse("2026-07-01T00:00:00.000Z");

  assert.equal(
    isStorageObjectPastRetention(
      {
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z"
      },
      cutoffMs
    ),
    false
  );
  assert.equal(
    isStorageObjectPastRetention(
      {
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-30T23:59:59.999Z"
      },
      cutoffMs
    ),
    true
  );
  assert.equal(isStorageObjectPastRetention({ createdAt: null, updatedAt: "invalid" }, cutoffMs), false);
});

test("temporary storage retention windows are conservative", () => {
  const dayMs = 24 * 60 * 60 * 1000;

  assert.equal(TEMP_IMPORT_RETENTION_MS, 14 * dayMs);
  assert.equal(GENERATED_EXPORT_RETENTION_MS, 7 * dayMs);
});

test("temporary bucket limits stay within the Supabase Free Tier ceiling", () => {
  assert.equal(STORAGE_FREE_TIER_MAX_BYTES, 50 * 1024 * 1024);
  assert.ok(IMPORT_MAX_BYTES <= STORAGE_FREE_TIER_MAX_BYTES);
  assert.ok(REPORT_EXPORT_MAX_BYTES <= STORAGE_FREE_TIER_MAX_BYTES);
});

test("system wipe deletes database rows before delegating evidence deletion to the outbox", async () => {
  const adminSource = await readFile(new URL("../lib/admin/runtime.ts", import.meta.url), "utf8");
  const wipeSource = adminSource.slice(adminSource.indexOf("export async function wipeSystemData"));
  const databaseDeleteIndex = wipeSource.indexOf('await deleteAllRows("report_batches", "id")');
  const outboxIndex = wipeSource.indexOf('.from("storage_deletion_outbox")');

  assert.ok(databaseDeleteIndex >= 0, "wipe no longer deletes report rows");
  assert.ok(outboxIndex > databaseDeleteIndex, "outbox status was read before the database delete committed");
  assert.doesNotMatch(wipeSource, /removeStoragePrefix\(REPORT_EVIDENCE_BUCKET/);
});

test("restore delegates immutable evidence writes to the restricted restore RPC", async () => {
  const restoreSource = await readFile(new URL("../scripts/restore-backup.mjs", import.meta.url), "utf8");
  const deleteOrder = restoreSource.slice(
    restoreSource.indexOf("const DELETE_ORDER"),
    restoreSource.indexOf("const INSERT_ORDER")
  );
  const insertOrder = restoreSource.slice(
    restoreSource.indexOf("const INSERT_ORDER"),
    restoreSource.indexOf("const PRIMARY_KEYS")
  );

  assert.doesNotMatch(deleteOrder, /report_evidence_(versions|status_events)/);
  assert.doesNotMatch(insertOrder, /report_evidence_(versions|status_events)/);
  assert.match(restoreSource, /rpc\("restore_report_evidence_snapshot"/);
  assert.match(restoreSource, /p_events: rowsByTable\.report_evidence_status_events\s*\n/);
  assert.doesNotMatch(restoreSource, /p_events:[\s\S]{0,120}\.map\(/);
});

test("maintenance isolates stages so temporary cleanup still runs after an outbox failure", async () => {
  const routeSource = await readFile(
    new URL("../app/api/cron/maintenance/route.ts", import.meta.url),
    "utf8"
  );
  const outboxStage = routeSource.indexOf('runMaintenanceStage("storage-deletion-outbox"');
  const cleanupStage = routeSource.indexOf('runMaintenanceStage("temporary-storage-cleanup"');

  assert.match(routeSource, /async function runMaintenanceStage/);
  assert.ok(outboxStage >= 0, "outbox maintenance stage is missing");
  assert.ok(cleanupStage > outboxStage, "temporary cleanup is not run after the isolated outbox stage");
});

test("stored import sources are only removed after a terminal database status is confirmed", async () => {
  const storageImport = await readFile(new URL("../lib/import/storage-service.ts", import.meta.url), "utf8");
  const statusRead = storageImport.indexOf('.select("status")');
  const remove = storageImport.indexOf(".remove([input.path])");

  assert.ok(statusRead >= 0, "import source cleanup does not read the durable job status");
  assert.ok(remove > statusRead, "import source is removed before terminal status verification");
  assert.match(storageImport, /status === "completed" \|\| statusResult\.data\?\.status === "failed"/);
});

test("import processing refreshes heartbeat at bounded processing checkpoints", async () => {
  const [importSource, jobService, applyService] = await Promise.all([
    readFile(new URL("../lib/import/process.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/import/job-service.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/import/apply-service.ts", import.meta.url), "utf8")
  ]);
  const processSource = importSource.slice(
    importSource.indexOf("export async function processImportCsvText")
  );
  const heartbeatCalls = processSource.match(/await heartbeat\(importBatchId/g) || [];

  assert.match(jobService, /rpc\("heartbeat_import_batch"/);
  assert.match(jobService, /result\.data !== true/);
  assert.match(processSource, /ticketIndex % IMPORT_HEARTBEAT_ROW_INTERVAL === 0/);
  assert.ok(heartbeatCalls.length >= 3, "long-running import phases do not refresh heartbeat");
  assert.ok(
    processSource.lastIndexOf("await heartbeat(importBatchId")
      < processSource.indexOf("options?.apply || applyImportBatchTransaction"),
    "import is applied without a final lease check"
  );
  assert.match(applyService, /rpc\("apply_import_batch"/);
});
