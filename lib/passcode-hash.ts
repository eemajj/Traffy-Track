import { createHmac, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(nodeScrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>;

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_DIGEST_PREFIX = "scrypt$";

/**
 * Legacy fast HMAC digest (v1). Kept only so existing rows keep working until
 * their next successful login upgrades them to the memory-hard format.
 */
export function digestLegacyPasscode(passcode: string, pepper: string) {
  return createHmac("sha256", pepper)
    .update(`citydata-passcode-v1:${passcode}`, "utf8")
    .digest("hex");
}

/**
 * Memory-hard scrypt digest (v2). Format:
 *   scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>
 */
export async function hashPasscode(passcode: string) {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await scrypt(passcode, salt, SCRYPT_KEY_LENGTH, SCRYPT_PARAMS);
  return `${SCRYPT_DIGEST_PREFIX}${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function isLegacyPasscodeDigest(storedDigest: string) {
  return !storedDigest.startsWith(SCRYPT_DIGEST_PREFIX);
}

function constantTimeHexEqual(leftHex: string, rightHex: string) {
  const left = Buffer.from(leftHex, "hex");
  const right = Buffer.from(rightHex, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function verifyPasscodeDigest(
  passcode: string,
  storedDigest: string,
  pepper: string
): Promise<boolean> {
  if (!storedDigest.startsWith(SCRYPT_DIGEST_PREFIX)) {
    return constantTimeHexEqual(digestLegacyPasscode(passcode, pepper), storedDigest);
  }

  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = storedDigest.split("$");
  const n = Number.parseInt(nRaw || "", 10);
  const r = Number.parseInt(rRaw || "", 10);
  const p = Number.parseInt(pRaw || "", 10);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p) || !saltHex || !hashHex) {
    return false;
  }
  if ((n & (n - 1)) !== 0 || n < 16384 || r < 8 || p < 1) {
    // Reject parameter drift below the configured floor.
    return false;
  }

  try {
    const derived = await scrypt(passcode, Buffer.from(saltHex, "hex"), Buffer.byteLength(hashHex, "hex"), {
      N: n,
      r,
      p
    });
    return timingSafeEqual(derived, Buffer.from(hashHex, "hex"));
  } catch {
    return false;
  }
}