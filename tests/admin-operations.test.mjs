import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin operations are role-gated, confirmed, and audited", async () => {
  const route = await readFile(
    new URL("../app/api/admin/operations/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(route, /requireApiPermission\("admin:operations"\)/);
  assert.match(route, /RETRY STORAGE QUEUE/);
  assert.match(route, /operations\.storage_queue_retried/);
  assert.match(route, /operations\.maintenance_run/);
  assert.match(route, /revalidateTag\(ADMIN_OVERVIEW_CACHE_TAG/);
  assert.match(route, /recoverStaleImportJobs/);
  assert.match(route, /reconcileStorageDeletionOutbox/);
  assert.match(route, /cleanupTemporaryStorage/);
});

test("storage queue retries only terminal or failed jobs and clears stale leases", async () => {
  const maintenance = await readFile(
    new URL("../lib/maintenance.ts", import.meta.url),
    "utf8"
  );

  const retryFunction = maintenance.slice(
    maintenance.indexOf("export async function retryFailedStorageDeletionJobs"),
    maintenance.indexOf("async function listExpiredStorageObjects")
  );

  assert.match(retryFunction, /\.in\("status", \["failed", "dead"\]\)/);
  assert.match(retryFunction, /status: "pending"/);
  assert.match(retryFunction, /attempts: 0/);
  assert.match(retryFunction, /lease_token: null/);
  assert.match(retryFunction, /locked_until: null/);
  assert.match(retryFunction, /\.limit\(500\)/);
});
