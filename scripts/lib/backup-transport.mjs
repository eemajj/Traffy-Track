import { createCipheriv, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function encryptBackupArtifact(data, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await scrypt(passphrase, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  const header = Buffer.from(JSON.stringify({
    format: "tf-backup-encrypted-v1", cipher: "aes-256-gcm", kdf: "scrypt",
    salt: salt.toString("base64"), iv: iv.toString("base64"), tag: tag.toString("base64")
  }), "utf8");
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(header.length);
  return Buffer.concat([Buffer.from("TFBACKUP1", "ascii"), headerLength, header, ciphertext]);
}

export function decodeHtmlAttribute(value) {
  return value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}
export function getHtmlAttribute(tag, name) { return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null; }
