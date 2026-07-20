import assert from "node:assert/strict";
import test from "node:test";
import { getSupabaseProjectRef, parseRestoreArguments, prepareRestoreRows } from "../scripts/lib/restore-plan.mjs";
test("restore plan validates target arguments and strips generated identifiers", () => {
  assert.equal(parseRestoreArguments(["--backup-dir", "/tmp/backup", "--apply"]).apply, true);
  assert.equal(getSupabaseProjectRef("https://projectref.supabase.co"), "projectref");
  assert.deepEqual(prepareRestoreRows("ticket_history", [{ id: 1, ticket_id: "T-1" }]), [{ ticket_id: "T-1" }]);
  assert.throws(() => parseRestoreArguments([]), /--backup-dir/);
});
