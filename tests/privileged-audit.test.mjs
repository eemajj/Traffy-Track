import assert from "node:assert/strict";
import test from "node:test";

import { buildPrivilegedFailureAudit, buildPrivilegedSuccessAudit } from "../lib/privileged-audit.ts";

test("privileged audit builders preserve success and degraded outcomes", () => {
  assert.deepEqual(buildPrivilegedSuccessAudit({ action: "system.wipe", resourceType: "system", resourceId: "reports", metadata: { mode: "reports" } }), {
    action: "system.wipe", resourceType: "system", resourceId: "reports", metadata: { mode: "reports" }
  });
  assert.equal(buildPrivilegedSuccessAudit({ action: "operations.run", resourceType: "system", degraded: true }).outcome, "failure");
});

test("privileged failure audit standardizes error metadata without discarding context", () => {
  assert.deepEqual(buildPrivilegedFailureAudit({
    action: "backup.export",
    resourceType: "backup_artifact",
    error: new Error("storage failed"),
    metadata: { stage: "upload" }
  }), {
    action: "backup.export",
    resourceType: "backup_artifact",
    resourceId: undefined,
    outcome: "failure",
    metadata: { stage: "upload", message: "storage failed" }
  });
});
