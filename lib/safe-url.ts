export function getSafeHttpsUrl(value: string | null | undefined) {
  const normalized = value?.trim();

  if (!normalized || /[\u0000-\u001F\u007F]/.test(normalized)) {
    return null;
  }

  try {
    const parsed = new URL(normalized);

    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}
