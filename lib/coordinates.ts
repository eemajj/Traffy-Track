export function parseCoordinates(value: string | undefined) {
  const normalized = (value || "").trim();
  if (!normalized) {
    return { lat: null, lng: null };
  }

  const parts = normalized.split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) {
    return { lat: null, lng: null };
  }

  const [first, second] = parts;

  // CityData exports `coords` as longitude,latitude (for example
  // `100.33389,13.76195`). Accept conventional latitude,longitude too.
  if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
    return { lat: second, lng: first };
  }

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return { lat: first, lng: second };
  }

  return { lat: null, lng: null };
}
