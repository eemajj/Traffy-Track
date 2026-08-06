import { createSupabaseAdminClient } from "@/lib/supabase";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 1000;
const OFFICE_NAME = "สำนักงานเขตทวีวัฒนา";
const DISTRICT_NAME = "เขตทวีวัฒนา";

export const SUMMARY_PENDING_STATES = [
  "รับเรื่อง",
  "กำลังดำเนินการ",
  "ศึกษาปัญหา",
  "ของบประมาณ",
  "จัดซื้อจัดจ้าง",
  "ขั้นตอนทางกฎหมาย",
  "ติดตามเรื่อง",
  "ส่งต่อ(ใหม่)"
] as const;

type SummaryTicketRow = {
  ticket_id: string;
  timestamp: string;
  state: string;
  org_list: string[];
  dept_list: string[];
};

export type SummaryPendingState = (typeof SUMMARY_PENDING_STATES)[number];

export type SummaryReportData = {
  officeName: string;
  fromDate: string;
  toDate: string;
  generatedAt: string;
  total: number;
  intake: {
    waiting: number;
    district: number;
    otherAgency: number;
    irrelevant: number;
  };
  completed: {
    total: number;
    district: number;
    otherAgency: number;
  };
  pending: {
    total: number;
    actionableTotal: number;
    byState: Record<SummaryPendingState, number>;
  };
  agingMatrix: {
    normal: number;
    warning: number;
    overdue: number;
    critical: number;
  };
  departments: Array<{
    name: string;
    total: number;
    byState: Array<{ state: Exclude<SummaryPendingState, "ส่งต่อ(ใหม่)">; count: number }>;
  }>;
};

function assertDate(value: string, label: string) {
  if (!DATE_PATTERN.test(value) || Number.isNaN(new Date(`${value}T12:00:00+07:00`).getTime())) {
    throw new Error(`กรุณาระบุ${label}ให้ถูกต้อง`);
  }
}

function getBangkokDayStart(value: string) {
  return new Date(`${value}T00:00:00+07:00`).toISOString();
}

function getBangkokNextDayStart(value: string) {
  const date = new Date(`${value}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function getFinalOrganization(ticket: SummaryTicketRow) {
  return ticket.org_list.at(-1) || "";
}

function isDistrictOrganization(ticket: SummaryTicketRow) {
  return getFinalOrganization(ticket).includes(DISTRICT_NAME);
}

function getResponsibleDistrictDepartment(ticket: SummaryTicketRow) {
  return [...ticket.dept_list].reverse().find((department) => department.includes(DISTRICT_NAME)) || null;
}

function getDepartmentDisplayName(value: string) {
  return value.replace(/\s+เขตทวีวัฒนา\s*$/, "").trim();
}

function normalizePendingState(state: string): SummaryPendingState | null {
  if (state === "รอรับเรื่อง") {
    return "รับเรื่อง";
  }

  return SUMMARY_PENDING_STATES.includes(state as SummaryPendingState)
    ? (state as SummaryPendingState)
    : null;
}

export function summarizeTicketsForReport(
  tickets: SummaryTicketRow[],
  input: { fromDate: string; toDate: string; generatedAt?: string }
): SummaryReportData {
  const intake = { waiting: 0, district: 0, otherAgency: 0, irrelevant: 0 };
  const completed = { total: 0, district: 0, otherAgency: 0 };
  const byState = Object.fromEntries(SUMMARY_PENDING_STATES.map((state) => [state, 0])) as Record<
    SummaryPendingState,
    number
  >;
  const departmentCounts = new Map<string, Map<Exclude<SummaryPendingState, "ส่งต่อ(ใหม่)">, number>>();

  for (const ticket of tickets) {
    const state = ticket.state || "";
    const districtOrganization = isDistrictOrganization(ticket);

    if (state === "ไม่เกี่ยวข้อง") {
      intake.irrelevant += 1;
    } else if (state === "รอรับเรื่อง") {
      intake.waiting += 1;
    } else if (districtOrganization) {
      intake.district += 1;
    } else {
      intake.otherAgency += 1;
    }

    if (state === "เสร็จสิ้น") {
      completed.total += 1;
      if (districtOrganization) {
        completed.district += 1;
      } else {
        completed.otherAgency += 1;
      }
      continue;
    }

    if (state === "ไม่เกี่ยวข้อง") {
      continue;
    }

    const pendingState = normalizePendingState(state);
    if (!pendingState) {
      continue;
    }

    byState[pendingState] += 1;

    if (pendingState === "ส่งต่อ(ใหม่)") {
      continue;
    }

    const department = getResponsibleDistrictDepartment(ticket);
    if (!department) {
      continue;
    }

    const displayName = getDepartmentDisplayName(department);
    const counts = departmentCounts.get(displayName) || new Map();
    counts.set(pendingState, (counts.get(pendingState) || 0) + 1);
    departmentCounts.set(displayName, counts);
  }

  const departmentStateOrder = SUMMARY_PENDING_STATES.filter(
    (state): state is Exclude<SummaryPendingState, "ส่งต่อ(ใหม่)"> => state !== "ส่งต่อ(ใหม่)"
  );
  const departments = [...departmentCounts.entries()]
    .map(([name, counts]) => {
      const departmentByState = departmentStateOrder
        .map((state) => ({ state, count: counts.get(state) || 0 }))
        .filter((entry) => entry.count > 0);

      return {
        name,
        total: departmentByState.reduce((sum, entry) => sum + entry.count, 0),
        byState: departmentByState
      };
    })
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, "th"));

  const pendingTotal = SUMMARY_PENDING_STATES.reduce((sum, state) => sum + byState[state], 0);

  const agingMatrix = { normal: 0, warning: 0, overdue: 0, critical: 0 };
  const now = new Date();

  for (const ticket of tickets) {
    if (ticket.state === "เสร็จสิ้น" || ticket.state === "ไม่เกี่ยวข้อง") continue;
    const pendingState = normalizePendingState(ticket.state);
    if (!pendingState || pendingState === "ส่งต่อ(ใหม่)") continue;

    const created = new Date(ticket.timestamp);
    if (Number.isNaN(created.getTime())) continue;
    const ageDays = Math.max(0, Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)));

    if (ageDays >= 31) agingMatrix.critical++;
    else if (ageDays >= 15) agingMatrix.overdue++;
    else if (ageDays >= 8) agingMatrix.warning++;
    else agingMatrix.normal++;
  }

  return {
    officeName: OFFICE_NAME,
    fromDate: input.fromDate,
    toDate: input.toDate,
    generatedAt: input.generatedAt || new Date().toISOString(),
    total: tickets.length,
    intake,
    completed,
    pending: {
      total: pendingTotal,
      actionableTotal: pendingTotal - byState["ส่งต่อ(ใหม่)"],
      byState
    },
    agingMatrix,
    departments
  };
}

export async function getSummaryReportData(input: { fromDate: string; toDate: string }) {
  assertDate(input.fromDate, "วันที่เริ่มต้น");
  assertDate(input.toDate, "วันที่สิ้นสุด");

  if (input.fromDate > input.toDate) {
    throw new Error("วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด");
  }

  const supabase = createSupabaseAdminClient();
  const tickets: SummaryTicketRow[] = [];
  const startAt = getBangkokDayStart(input.fromDate);
  const endAt = getBangkokNextDayStart(input.toDate);

  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await supabase
      .from("tickets")
      .select("ticket_id, timestamp, state, org_list, dept_list")
      .gte("timestamp", startAt)
      .lt("timestamp", endAt)
      .order("ticket_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (result.error) {
      throw new Error(`โหลดข้อมูลสำหรับรายงานไม่สำเร็จ: ${result.error.message}`);
    }

    const page = (result.data || []) as SummaryTicketRow[];
    tickets.push(...page);

    if (page.length < PAGE_SIZE) {
      break;
    }
  }

  return summarizeTicketsForReport(tickets, input);
}
