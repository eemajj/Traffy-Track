export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

const SESSION_TOKEN_VERSION = "v2";
const SESSION_SECRET_MIN_BYTES = 32;

export type SessionRole = "admin" | "operator";

export type SessionClaims = {
  version: "v1" | "v2";
  role: SessionRole;
  expiresAt: number;
};

function getSessionSecret() {
  const secret = process.env.APP_SESSION_SECRET;

  if (!secret) {
    throw new Error("Missing required environment variable: APP_SESSION_SECRET");
  }

  if (new TextEncoder().encode(secret).byteLength < SESSION_SECRET_MIN_BYTES) {
    throw new Error(`APP_SESSION_SECRET must be at least ${SESSION_SECRET_MIN_BYTES} bytes`);
  }

  return secret;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

async function signSessionPayload(payload: string) {
  const secret = getSessionSecret();

  if (!secret) {
    return "";
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));

  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createSessionCookieValue(role: SessionRole = "admin", maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const payload = `${SESSION_TOKEN_VERSION}.${expiresAt}.${role}`;
  const signature = await signSessionPayload(payload);

  return `${payload}.${signature}`;
}

export async function getSessionClaims(value: string | undefined): Promise<SessionClaims | null> {
  try {
    getSessionSecret();
  } catch {
    return null;
  }

  if (!value) {
    return null;
  }

  const parts = value.split(".");
  const version = parts[0];
  const expiresAtValue = parts[1];
  const isLegacyToken = version === "v1" && parts.length === 3;
  const isRoleToken = version === SESSION_TOKEN_VERSION && parts.length === 4;

  if ((!isLegacyToken && !isRoleToken) || !expiresAtValue) {
    return null;
  }

  const expiresAt = Number.parseInt(expiresAtValue, 10);

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  const role = isLegacyToken ? "admin" : parts[2];
  const signature = isLegacyToken ? parts[2] : parts[3];

  if ((role !== "admin" && role !== "operator") || !signature) {
    return null;
  }

  const payload = isLegacyToken ? `${version}.${expiresAtValue}` : `${version}.${expiresAtValue}.${role}`;
  const expectedSignature = await signSessionPayload(payload);

  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  return {
    version: isLegacyToken ? "v1" : "v2",
    role,
    expiresAt
  };
}

export async function verifySessionCookieValue(value: string | undefined) {
  return Boolean(await getSessionClaims(value));
}
