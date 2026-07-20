export const REPORT_EVIDENCE_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

export const REPORT_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

const EVIDENCE_VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEvidenceVersionId(value: string) {
  return EVIDENCE_VERSION_ID_PATTERN.test(value);
}

export function validateEvidenceUpload(input: { contentType: string; size: number }) {
  if (!REPORT_EVIDENCE_ALLOWED_TYPES.has(input.contentType)) {
    return "รองรับเฉพาะไฟล์ JPG, PNG, WebP และ PDF";
  }

  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > REPORT_EVIDENCE_MAX_BYTES) {
    return "ไฟล์ต้องมีขนาดไม่เกิน 10 MB";
  }

  return null;
}

export async function inspectEvidenceBlob(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let contentType: string | null = null;

  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") {
    contentType = "application/pdf";
  } else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    contentType = "image/jpeg";
  } else if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    contentType = "image/png";
  } else if (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    contentType = "image/webp";
  }

  if (!contentType) {
    throw new Error("ชนิดไฟล์จริงไม่ใช่ JPG, PNG, WebP หรือ PDF ที่รองรับ");
  }

  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return {
    contentType,
    sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  };
}
