import { getBangkokTodayValue } from "../report-date.ts";

export const TRAFFY_STATUS_ORDER = [
  "รอรับเรื่อง",
  "รับเรื่อง",
  "กำลังดำเนินการ",
  "ศึกษาปัญหา",
  "จัดทำนโยบาย",
  "ของบประมาณ",
  "จัดซื้อจัดจ้าง",
  "ขั้นตอนทางกฎหมาย",
  "เสร็จสิ้น",
  "ส่งต่อ(ใหม่)",
  "ไม่เกี่ยวข้อง",
  "ติดตามเรื่อง"
] as const;

export type TraffyStatusName = (typeof TRAFFY_STATUS_ORDER)[number];

export function isExternalAgencyOrgResponse(orgResponse: string | null): { isExternal: boolean; externalOrgName: string | null } {
  if (!orgResponse) {
    return { isExternal: false, externalOrgName: null };
  }

  const orgs = orgResponse.split(",").map((s) => s.trim()).filter(Boolean);
  if (orgs.length === 0) {
    return { isExternal: false, externalOrgName: null };
  }

  const finalOrg = orgs[orgs.length - 1];
  const isDistrict = finalOrg.includes("เขตทวีวัฒนา") || finalOrg.includes("ทวีวัฒนา") || finalOrg.startsWith("ฝ่าย");

  if (!isDistrict) {
    return { isExternal: true, externalOrgName: finalOrg };
  }

  return { isExternal: false, externalOrgName: null };
}

export type DashboardStatisticsTicket = {
  ticket_id: string;
  type: string | null;
  timestamp: string | null;
  last_activity: string | null;
  state: string | null;
  star: number | null;
};

export type DashboardDateRange = {
  from: string;
  to: string;
};

export type DashboardStatisticsReady = {
  status: "ready";
  range: DashboardDateRange;
  generatedAt: string;
  total: number;
  managed: number;
  unknownStateCount: number;
  statusRows: Array<{
    name: TraffyStatusName;
    count: number;
    percent: number;
  }>;
  rollup: {
    start: number;
    inProgress: number;
    finish: number;
    forward: number;
    irrelevantRaw: number;
    follow: number;
    irrelevantAggregate: number;
  };
  finishedLowRating: {
    count: number;
    percentOfFinished: number;
    method: "finished_with_star_1_or_2";
  };
  feedback: {
    count: number;
    average: number | null;
  };
  byThis: {
    availability: "unavailable";
    reason: string;
  };
  resolutionTime: {
    availability: "unavailable";
    reason: string;
  };
  problemTypes: Array<{
    name: string;
    count: number;
    percent: number;
  }>;
};

export type DashboardStatisticsData =
  | { status: "missing_env"; range: DashboardDateRange }
  | { status: "invalid_range"; range: DashboardDateRange; message: string }
  | { status: "unavailable"; range: DashboardDateRange; message: string }
  | DashboardStatisticsReady;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_FROM_DATE = "2022-05-22";

function isValidCalendarDate(value: string) {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function normalizeDashboardDateRange(input: {
  from?: string | string[];
  to?: string | string[];
}, today = getBangkokTodayValue()): DashboardDateRange {
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  return {
    from: first(input.from) || DEFAULT_FROM_DATE,
    to: first(input.to) || today
  };
}

export function validateDashboardDateRange(range: DashboardDateRange) {
  if (!isValidCalendarDate(range.from) || !isValidCalendarDate(range.to)) {
    return "กรุณาระบุช่วงวันที่ให้ถูกต้อง";
  }
  if (range.from > range.to) {
    return "วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด";
  }
  return null;
}

export function getBangkokRangeBounds(range: DashboardDateRange) {
  const error = validateDashboardDateRange(range);
  if (error) throw new Error(error);
  const end = new Date(`${range.to}T00:00:00+07:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    startAt: new Date(`${range.from}T00:00:00+07:00`).toISOString(),
    endAt: end.toISOString()
  };
}

function percentage(count: number, total: number) {
  return total > 0 ? Number(((count / total) * 100).toFixed(2)) : 0;
}

export function summarizeDashboardTickets(
  tickets: DashboardStatisticsTicket[],
  range: DashboardDateRange,
  generatedAt = new Date().toISOString()
): DashboardStatisticsReady {
  const statusCounts = new Map<TraffyStatusName, number>(TRAFFY_STATUS_ORDER.map((name) => [name, 0]));
  const problemTypeCounts = new Map<string, number>();
  let unknownStateCount = 0;
  let feedbackCount = 0;
  let feedbackTotal = 0;
  let finishedLowRatingCount = 0;

  for (const ticket of tickets) {
    const state = (ticket.state || "").trim();
    if (statusCounts.has(state as TraffyStatusName)) {
      statusCounts.set(state as TraffyStatusName, (statusCounts.get(state as TraffyStatusName) || 0) + 1);
    } else {
      unknownStateCount += 1;
    }

    const problemType = (ticket.type || "ไม่ระบุประเภท").trim() || "ไม่ระบุประเภท";
    problemTypeCounts.set(problemType, (problemTypeCounts.get(problemType) || 0) + 1);

    if (ticket.star !== null && ticket.star >= 1 && ticket.star <= 5) {
      feedbackCount += 1;
      feedbackTotal += ticket.star;
    }

    if (state === "เสร็จสิ้น" && (ticket.star === 1 || ticket.star === 2)) {
      finishedLowRatingCount += 1;
    }
  }

  const total = tickets.length;
  const count = (name: TraffyStatusName) => statusCounts.get(name) || 0;
  const start = count("รอรับเรื่อง");
  const inProgress = count("รับเรื่อง")
    + count("กำลังดำเนินการ")
    + count("ศึกษาปัญหา")
    + count("จัดทำนโยบาย")
    + count("ของบประมาณ")
    + count("จัดซื้อจัดจ้าง")
    + count("ขั้นตอนทางกฎหมาย");
  const finish = count("เสร็จสิ้น");
  const forward = count("ส่งต่อ(ใหม่)");
  const irrelevantRaw = count("ไม่เกี่ยวข้อง");
  const follow = count("ติดตามเรื่อง");

  return {
    status: "ready",
    range,
    generatedAt,
    total,
    managed: Math.max(0, total - start),
    unknownStateCount,
    statusRows: TRAFFY_STATUS_ORDER.map((name) => ({
      name,
      count: count(name),
      percent: percentage(count(name), total)
    })),
    rollup: {
      start,
      inProgress,
      finish,
      forward,
      irrelevantRaw,
      follow,
      irrelevantAggregate: irrelevantRaw + follow
    },
    finishedLowRating: {
      count: finishedLowRatingCount,
      percentOfFinished: percentage(finishedLowRatingCount, finish),
      method: "finished_with_star_1_or_2"
    },
    feedback: {
      count: feedbackCount,
      average: feedbackCount > 0 ? Number((feedbackTotal / feedbackCount).toFixed(2)) : null
    },
    byThis: {
      availability: "unavailable",
      reason: "ไฟล์ CityData ไม่มีผู้ดำเนินการที่ปิดเรื่อง จึงไม่คาดเดาจากชื่อหน่วยงานล่าสุด"
    },
    resolutionTime: {
      availability: "unavailable",
      reason: "ไฟล์ CityData ไม่มีเวลาที่เปลี่ยนเป็นสถานะเสร็จสิ้น จึงยังคำนวณช่วงเวลาแบบ Traffy ไม่ได้"
    },
    problemTypes: [...problemTypeCounts.entries()]
      .map(([name, value]) => ({ name, count: value, percent: percentage(value, total) }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "th"))
      .slice(0, 10)
  };
}
