export const ANALYTICS_PERIODS = [30, 90, 180] as const;
export type AnalyticsPeriodDays = (typeof ANALYTICS_PERIODS)[number];

export function getAnalyticsPeriodDays(value: string | string[] | undefined): AnalyticsPeriodDays {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number(rawValue);

  return ANALYTICS_PERIODS.includes(parsed as AnalyticsPeriodDays)
    ? (parsed as AnalyticsPeriodDays)
    : 90;
}
