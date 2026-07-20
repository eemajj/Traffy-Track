import { createDecipheriv, createHash, scrypt as scryptCallback } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const artifactPath = args.get("--artifact");
const manifestPath = args.get("--manifest");
const passphraseFile = args.get("--passphrase-file");
const plaintextPath = args.get("--write-plaintext");
if (!artifactPath || !manifestPath || !passphraseFile) {
  throw new Error("Usage: node scripts/verify-backup-artifact.mjs --artifact <path> --manifest <path> --passphrase-file <path> [--write-plaintext <path>]");
}

const [artifact, manifestText, passphraseText] = await Promise.all([
  readFile(artifactPath),
  readFile(manifestPath, "utf8"),
  readFile(passphraseFile, "utf8")
]);
const manifest = JSON.parse(manifestText);
const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
if (artifactSha256 !== manifest.artifactSha256) throw new Error("Artifact SHA-256 mismatch");
if (artifact.subarray(0, 9).toString("ascii") !== "TFBACKUP1") throw new Error("Encrypted artifact magic is invalid");

const headerLength = artifact.readUInt32BE(9);
const headerEnd = 13 + headerLength;
const header = JSON.parse(artifact.subarray(13, headerEnd).toString("utf8"));
if (header.format !== "tf-backup-encrypted-v1" || header.cipher !== "aes-256-gcm" || header.kdf !== "scrypt") {
  throw new Error("Unsupported encrypted artifact format");
}

const key = await scrypt(passphraseText.trim(), Buffer.from(header.salt, "base64"), 32);
const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(header.iv, "base64"));
decipher.setAuthTag(Buffer.from(header.tag, "base64"));
const plaintext = Buffer.concat([decipher.update(artifact.subarray(headerEnd)), decipher.final()]);
const plaintextSha256 = createHash("sha256").update(plaintext).digest("hex");
if (plaintextSha256 !== manifest.plaintextSha256) throw new Error("Plaintext SHA-256 mismatch");
if (plaintext.subarray(0, 2).toString("ascii") !== "PK") throw new Error("Decrypted artifact is not a ZIP file");
if (plaintextPath) await writeFile(plaintextPath, plaintext, { mode: 0o600 });

console.log(JSON.stringify({
  verified: true,
  encrypted: true,
  artifactSha256,
  plaintextSha256,
  plaintextBytes: plaintext.length,
  plaintextPath: plaintextPath || null
}, null, 2));
