export function getSafeHttpsUrl(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized || /[\u0000-\u001F\u007F]/.test(normalized)) {
    return null;
  }

  try {
    let candidate = normalized;
    const outer = new URL(candidate);

    // Some CityData exports contain the real GCS URL wrapped inside another
    // traffy_public_bucket object path, for example:
    //   .../traffy_public_bucket/{https://storage.googleapis.com/.../photo.jpg}
    // GCS treats the whole wrapped value as an object key and returns NoSuchKey.
    // Unwrap only the known Traffy bucket shape; arbitrary nested URLs remain
    // rejected by the normal HTTPS validation below.
    if (outer.hostname === "storage.googleapis.com" && outer.pathname.startsWith("/traffy_public_bucket/")) {
      let objectKey = outer.pathname.slice("/traffy_public_bucket/".length);
      try {
        objectKey = decodeURIComponent(objectKey);
      } catch {
        return null;
      }

      const wrapped = objectKey.match(
        /^\{(https:\/\/storage\.googleapis\.com\/traffy_public_bucket\/attachment\/[^{}]+)\}$/
      );
      if (wrapped) {
        candidate = wrapped[1];
      } else if (objectKey.startsWith("{") || objectKey.endsWith("}")) {
        return null;
      }
    }

    const parsed = new URL(candidate);

    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}
