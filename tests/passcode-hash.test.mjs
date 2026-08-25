import assert from "node:assert/strict";
import { test } from "node:test";

import {
  digestLegacyPasscode,
  hashPasscode,
  isLegacyPasscodeDigest,
  verifyPasscodeDigest
} from "../lib/passcode-hash.ts";

const PEPPER = "unit-test-pepper-unit-test-pepper-32b!";
const OTHER_PEPPER = "other-pepper-other-pepper-other-32!";

test("scrypt hash verifies its own passcode and rejects others", async () => {
  const digest = await hashPasscode("secret-123456");
  assert.ok(digest.startsWith("scrypt$"), "digest should use the scrypt v2 format");
  assert.equal(await verifyPasscodeDigest("secret-123456", digest, PEPPER), true);
  assert.equal(await verifyPasscodeDigest("wrong-passcode", digest, PEPPER), false);
  assert.equal(isLegacyPasscodeDigest(digest), false);
});

test("legacy HMAC digests still verify and are flagged for upgrade", async () => {
  const legacy = digestLegacyPasscode("secret-123456", PEPPER);
  assert.equal(isLegacyPasscodeDigest(legacy), true);
  assert.equal(await verifyPasscodeDigest("secret-123456", legacy, PEPPER), true);
  assert.equal(await verifyPasscodeDigest("secret-123456", legacy, OTHER_PEPPER), false);
});

test("each hash call produces a unique salted digest", async () => {
  const first = await hashPasscode("same-passcode");
  const second = await hashPasscode("same-passcode");
  assert.notEqual(first, second);
});

test("malformed or weakened scrypt digests fail closed", async () => {
  assert.equal(await verifyPasscodeDigest("x", "scrypt$", PEPPER), false);
  assert.equal(await verifyPasscodeDigest("x", "scrypt$notanumber$8$1$aabb$ccdd", PEPPER), false);
  // N below the 16384 floor must be rejected.
  assert.equal(await verifyPasscodeDigest("x", "scrypt$1024$8$1$aabbccdd$aabbccdd", PEPPER), false);
});