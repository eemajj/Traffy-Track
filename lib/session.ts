export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

const SESSION_TOKEN_VERSION = "v2";
const IDENTITY_SESSION_TOKEN_VERSION = "v3";
const SESSION_SECRET_MIN_BYTES = 32;
const SESSION_PERMISSIONS = [
  "dashboard:view",
  "analytics:view",
  "analytics:export",
  "map:view",
  "cases:view",
  "import:manage",
  "reports:manage",
  "reports:create",
  "reports:export",
  "reports:evidence",
  "admin:manage",
  "admin:access",
  "admin:backup",
  "admin:operations",
  "system:maintenance"
] as const;
const LEGACY_OPERATOR_PERMISSIONS = SESSION_PERMISSIONS.filter(
  (permission) => permission !== "admin:manage"
);

export type SessionRole = "admin" | "operator";
export type SessionPermission = (typeof SESSION_PERMISSIONS)[number];

function normalizeSessionPermissions(values: unknown): SessionPermission[] {
  if (!Array.isArray(values)) return [];
  return SESSION_PERMISSIONS.filter((permission) => values.includes(permission));
}

export type SessionClaims = {
  version: "v1" | "v2" | "v3";
  role: SessionRole;
  expiresAt: number;
  identityId: string | null;
  displayName: string;
  position: string | null;
  roleLabel: string;
  permissions: SessionPermission[];
  accessVersion: number | null;
  mustRotate: boolean;
};

export type IdentitySessionInput = {
  identityId: string;
  displayName: string;
  position: string | null;
  roleLabel: string;
  permissions: SessionPermission[];
  isAdmin: boolean;
  accessVersion: number;
  mustRotate?: boolean;
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

function stringToBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToString(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
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

export async function createIdentitySessionCookieValue(
  input: IdentitySessionInput,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS
) {
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const encodedClaims = stringToBase64Url(JSON.stringify({
    identityId: input.identityId,
    displayName: input.displayName,
    position: input.position,
    roleLabel: input.roleLabel,
    permissions: input.isAdmin ? SESSION_PERMISSIONS : normalizeSessionPermissions(input.permissions),
    role: input.isAdmin ? "admin" : "operator",
    accessVersion: input.accessVersion
    ,mustRotate: input.mustRotate === true
  }));
  const payload = `${IDENTITY_SESSION_TOKEN_VERSION}.${expiresAt}.${encodedClaims}`;
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
  const isIdentityToken = version === IDENTITY_SESSION_TOKEN_VERSION && parts.length === 4;

  if ((!isLegacyToken && !isRoleToken && !isIdentityToken) || !expiresAtValue) {
    return null;
  }

  const expiresAt = Number.parseInt(expiresAtValue, 10);

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  if (isIdentityToken) {
    const encodedClaims = parts[2];
    const signature = parts[3];
    if (!encodedClaims || !signature) return null;
    const payload = `${version}.${expiresAtValue}.${encodedClaims}`;
    const expectedSignature = await signSessionPayload(payload);
    if (!constantTimeEqual(signature, expectedSignature)) return null;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(base64UrlToString(encodedClaims)) as Record<string, unknown>;
    } catch {
      return null;
    }

    const role = parsed.role;
    const identityId = parsed.identityId;
    const accessVersion = parsed.accessVersion;
    if (
      (role !== "admin" && role !== "operator") ||
      typeof identityId !== "string" ||
      typeof accessVersion !== "number" ||
      !Number.isInteger(accessVersion) ||
      accessVersion < 1
    ) {
      return null;
    }

    const permissions = role === "admin"
      ? [...SESSION_PERMISSIONS]
      : normalizeSessionPermissions(parsed.permissions);
    if (permissions.length === 0) return null;

    return {
      version: "v3",
      role,
      expiresAt,
      identityId,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : "ผู้ใช้งาน",
      position: typeof parsed.position === "string" ? parsed.position : null,
      roleLabel: typeof parsed.roleLabel === "string" ? parsed.roleLabel : "ผู้ใช้งาน",
      permissions,
      accessVersion
      ,mustRotate: parsed.mustRotate === true
    };
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
    expiresAt,
    identityId: null,
    displayName: role === "admin" ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่",
    position: null,
    roleLabel: role === "admin" ? "ผู้ดูแลระบบ" : "เจ้าหน้าที่",
    permissions: role === "admin"
      ? [...SESSION_PERMISSIONS]
      : [...LEGACY_OPERATOR_PERMISSIONS],
    accessVersion: null
    ,mustRotate: false
  };
}

export async function verifySessionCookieValue(value: string | undefined) {
  return Boolean(await getSessionClaims(value));
}
