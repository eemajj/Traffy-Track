export const BANGKOK_TIME_ZONE = "Asia/Bangkok";

const DEFAULT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: BANGKOK_TIME_ZONE
});

const DEFAULT_DATE_FORMATTER = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeZone: BANGKOK_TIME_ZONE
});

const DEFAULT_TIME_FORMATTER = new Intl.DateTimeFormat("th-TH", {
  timeStyle: "short",
  timeZone: BANGKOK_TIME_ZONE
});

function toValidDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Formats a timestamp into a Bangkok timezone date-time string (th-TH).
 * Example: "15 ก.ค. 2569, 14:30"
 */
export function formatBangkokDateTime(
  value: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = toValidDate(value);
  if (!date) return "-";
  if (!options) return DEFAULT_DATE_TIME_FORMATTER.format(date);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: BANGKOK_TIME_ZONE,
    ...options
  }).format(date);
}

/**
 * Formats a timestamp into a Bangkok timezone date-only string (th-TH).
 * Example: "15 ก.ค. 2569"
 */
export function formatBangkokDate(
  value: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = toValidDate(value);
  if (!date) return "-";
  if (!options) return DEFAULT_DATE_FORMATTER.format(date);
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: BANGKOK_TIME_ZONE,
    ...options
  }).format(date);
}

/**
 * Formats a timestamp into a Bangkok timezone time-only string (th-TH).
 * Example: "14:30"
 */
export function formatBangkokTime(
  value: string | number | Date | null | undefined
): string {
  const date = toValidDate(value);
  if (!date) return "-";
  return DEFAULT_TIME_FORMATTER.format(date);
}
