import assert from "node:assert/strict";
import test from "node:test";
import { decodeHtmlAttribute, encryptBackupArtifact, getHtmlAttribute } from "../scripts/lib/backup-transport.mjs";
test("backup transport creates the authenticated envelope and safely parses hidden inputs", async () => {
  const artifact = await encryptBackupArtifact(Buffer.from("backup"), "strong passphrase");
  assert.equal(artifact.subarray(0, 9).toString("ascii"), "TFBACKUP1");
  assert.equal(decodeHtmlAttribute("a&amp;b"), "a&b");
  assert.equal(getHtmlAttribute('<input name="token">', "name"), "token");
});
