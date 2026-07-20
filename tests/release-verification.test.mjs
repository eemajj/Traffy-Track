import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Production Import V2 contract verifier is target-pinned and read-only", async () => {
  const source = await readFile(new URL("../scripts/check-production-import-v2-contract.mjs", import.meta.url), "utf8");

  assert.match(source, /PRODUCTION_PROJECT_REF = "zllbfazkhrvlfutehkyh"/);
  assert.match(source, /application\/openapi\+json/);
  assert.match(source, /REQUIRED_BATCH_COLUMNS/);
  assert.match(source, /REQUIRED_TABLE_COLUMNS/);
  assert.match(source, /REQUIRED_RPCS/);
  assert.match(source, /active Import Pipeline V2 job/);
  assert.match(source, /mutationPerformed: false/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|rpc\(/);
});

test("predeploy fails closed on migration sidecars and local deployment artifacts", async () => {
  const [predeploy, hygiene, gitignore, vercelignore] = await Promise.all([
    readFile(new URL("../scripts/predeploy-check.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/check-release-hygiene.mjs", import.meta.url), "utf8"),
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../.vercelignore", import.meta.url), "utf8")
  ]);

  assert.match(predeploy, /check:release-hygiene/);
  assert.match(hygiene, /migration sidecars must be removed/);
  assert.match(hygiene, /invalid migration SQL filenames/);
  for (const pattern of [".npm/", ".supabase/", "output/", "tmp/", "summarizereport/"]) {
    assert.ok(gitignore.includes(pattern), `.gitignore is missing ${pattern}`);
    assert.ok(vercelignore.includes(pattern), `.vercelignore is missing ${pattern}`);
  }
});
