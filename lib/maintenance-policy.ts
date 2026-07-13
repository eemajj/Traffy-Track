const DAY_MS = 24 * 60 * 60 * 1000;

export const TEMP_IMPORT_RETENTION_MS = 14 * DAY_MS;
export const GENERATED_EXPORT_RETENTION_MS = 7 * DAY_MS;
export const STORAGE_FREE_TIER_MAX_BYTES = 50 * 1024 * 1024;
export const IMPORT_MAX_BYTES = STORAGE_FREE_TIER_MAX_BYTES;
export const REPORT_EXPORT_MAX_BYTES = STORAGE_FREE_TIER_MAX_BYTES;

export function isStorageObjectPastRetention(
  timestamps: {
    createdAt?: string | null;
    updatedAt?: string | null;
  },
  cutoffMs: number
) {
  const validTimestamps = [timestamps.createdAt, timestamps.updatedAt]
    .map((timestamp) => (timestamp ? Date.parse(timestamp) : Number.NaN))
    .filter(Number.isFinite);

  if (validTimestamps.length === 0) {
    return false;
  }

  return Math.max(...validTimestamps) < cutoffMs;
}
