export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

const SESSION_TOKEN_VERSION = "v1";

function getSessionSecret() {
  return process.env.APP_SESSION_SECRET || process.env.APP_PASSCODE || "";
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

export async function createSessionCookieValue(maxAgeSeconds = SESSION_MAX_AGE_SECONDS) {
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const payload = `${SESSION_TOKEN_VERSION}.${expiresAt}`;
  const signature = await signSessionPayload(payload);

  if (!signature) {
    throw new Error("Missing APP_PASSCODE or APP_SESSION_SECRET");
  }

  return `${payload}.${signature}`;
}

export async function verifySessionCookieValue(value: string | undefined) {
  if (!value) {
    return false;
  }

  const [version, expiresAtValue, signature] = value.split(".");

  if (version !== SESSION_TOKEN_VERSION || !expiresAtValue || !signature) {
    return false;
  }

  const expiresAt = Number.parseInt(expiresAtValue, 10);

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  const expectedSignature = await signSessionPayload(`${version}.${expiresAtValue}`);
  return constantTimeEqual(signature, expectedSignature);
}
