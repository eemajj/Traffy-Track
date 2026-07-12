export const BANGKOK_TIME_ZONE = "Asia/Bangkok";

const bangkokDateFormatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
  timeZone: BANGKOK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function getBangkokDateParts(date: Date) {
  const parts = Object.fromEntries(
    bangkokDateFormatter
      .formatToParts(date)
      .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function getBangkokTodayValue(date = new Date()) {
  const { year, month, day } = getBangkokDateParts(date);
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

export function getBangkokCurrentMonthRange(date = new Date()) {
  const { year, month } = getBangkokDateParts(date);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthValue = padDatePart(month);

  return {
    start: `${year}-${monthValue}-01`,
    end: `${year}-${monthValue}-${padDatePart(lastDay)}`
  };
}
