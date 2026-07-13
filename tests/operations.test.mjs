import assert from "node:assert/strict";
import test from "node:test";

import { isCronAuthorizationValid } from "../lib/cron-auth.ts";
import {
  GENERATED_EXPORT_RETENTION_MS,
  isStorageObjectPastRetention,
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
