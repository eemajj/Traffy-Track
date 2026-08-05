import { unstable_noStore as noStore } from "next/cache";

import {
  compareCaseListItems,
  getCaseSortField,
  normalizeCaseListSort,
  type CaseListSort
} from "@/lib/case-sort";
import { hasSupabaseAdminEnv } from "@/lib/env";
import { getSafeHttpsUrl } from "@/lib/safe-url";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { getCachedTicketFilterOptions } from "@/lib/ticket-filter-options";
import { CLOSED_TICKET_STATES, buildPendingStatesOrFilter, isClosedTicketState } from "@/lib/tickets";

const DEFAULT_CASES_PAGE_SIZE = 50;
const ALLOWED_CASES_PAGE_SIZES = [10, 50, 100] as const;

export type CaseListView = "pending" | "reopened" | "status-changed" | "unassigned" | "closed" | "all";

export type { CaseListSort } from "@/lib/case-sort";

export type CaseListFilters = {
  view?: string;
  q?: string;
  state?: string;
  dept?: string;
  role?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
};

export type CaseListItem = {
  ticket_id: string;
  type: string | null;
  comment: string | null;
  address: string | null;
  subdistrict: string | null;
  district: string | null;
  state: string | null;
  org_response: string | null;
  dept_list: string[];
  timestamp: string | null;
  last_activity: string | null;
  first_seen_at: string | null;
  updated_at: string | null;
  latestStateChange?: {
    old_value: string | null;
    new_value: string | null;
    detected_at: string;
  } | null;
  reopenedInLatestBatch?: boolean;
};

type TicketRow = Omit<CaseListItem, "dept_list"> & {
  dept_list: string[] | null;
};

type StateChangeRow = {
  id: number;
  ticket_id: string;
  old_value: string | null;
  new_value: string | null;
  detected_at: string;
  tickets: TicketRow | TicketRow[] | null;
};

export type CaseTimelineItem = {
  id: number;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  detected_at: string;
  import_batch_id: string | null;
  import_batches: {
    filename: string | null;
    imported_at: string | null;
  } | null;
};

type CaseTimelineRawItem = Omit<CaseTimelineItem, "import_batches"> & {
  import_batches:
    | {
        filename: string | null;
        imported_at: string | null;
      }
    | Array<{
        filename: string | null;
        imported_at: string | null;
      }>
    | null;
};

export type CaseDetailTicket = CaseListItem & {
  photo_url: string | null;
  province: string | null;
  org_list: string[];
  star: number | null;
  hashtag: string | null;
  lat: number | null;
  lng: number | null;
};

export type CaseListData =
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | {
      status: "ready";
      view: CaseListView;
      q: string;
      state: string;
      dept: string;
      role?: string;
      sort: CaseListSort;
      page: number;
      pageSize: number;
      totalCount: number;
      latestBatch: {
        id: string;
        imported_at: string;
        filename: string | null;
      } | null;
      stateOptions: string[];
      departmentOptions: string[];
      items: CaseListItem[];
    };

export type CaseDetailData =
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | { status: "not_found" }
  | {
      status: "ready";
      ticket: CaseDetailTicket;
      timeline: CaseTimelineItem[];
      stateTimeline: CaseTimelineItem[];
    };

function normalizeView(value: string | undefined): CaseListView {
  if (value === "reopened" || value === "status-changed" || value === "unassigned" || value === "closed" || value === "all") {
    return value;
  }

  return "pending";
}

function normalizePage(value: string | undefined) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizePageSize(value: string | undefined) {
  const parsed = Number.parseInt(value || String(DEFAULT_CASES_PAGE_SIZE), 10);
  return ALLOWED_CASES_PAGE_SIZES.some((size) => size === parsed) ? parsed : DEFAULT_CASES_PAGE_SIZE;
}

function normalizeTicketRow(row: TicketRow): CaseListItem {
  return {
    ...row,
    dept_list: Array.isArray(row.dept_list) ? row.dept_list : []
  };
}

function normalizeTicketRelation(relation: TicketRow | TicketRow[] | null) {
  const ticket = Array.isArray(relation) ? relation[0] : relation;
  return ticket ? normalizeTicketRow(ticket) : null;
}

function isClosedState(state: string | null) {
  return isClosedTicketState(state);
}

function doesTicketMatchSearch(ticket: CaseListItem, q: string) {
  if (!q) {
    return true;
  }

  const normalizedQuery = q.toLowerCase();
  return [ticket.ticket_id, ticket.comment, ticket.address, ticket.org_response]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

function doesTicketMatchListFilters(ticket: CaseListItem, filters: { q: string; state: string; dept: string; role?: string }) {
  if (!doesTicketMatchSearch(ticket, filters.q)) {
    return false;
  }

  if (filters.state && ticket.state !== filters.state) {
    return false;
  }

  if (filters.dept && !ticket.dept_list.includes(filters.dept)) {
    return false;
  }

  if (filters.role === "primary") {
    if (filters.dept) {
      if (ticket.dept_list[0] !== filters.dept) return false;
    } else if (ticket.dept_list.length !== 1) {
      return false;
    }
  }

  if (filters.role === "cohandling") {
    if (filters.dept) {
      if (ticket.dept_list.indexOf(filters.dept) <= 0) return false;
    } else if (ticket.dept_list.length <= 1) {
      return false;
    }
  }

  return true;
}

interface TicketFilterQuery {
  ilike(column: string, pattern: string): this;
  eq(column: string, value: unknown): this;
  contains(column: string, value: unknown): this;
  not(column: string, operator: string, value: unknown): this;
  or(filters: string): this;
}

function addTicketFilters<QueryBuilder extends TicketFilterQuery>(
  query: QueryBuilder,
  filters: {
    q: string;
    state: string;
    dept: string;
    role?: string;
    view: CaseListView;
    relationPrefix?: string;
  }
) {
  const prefix = filters.relationPrefix ? `${filters.relationPrefix}.` : "";
  let nextQuery = query;

  if (filters.view === "pending" || filters.view === "reopened" || filters.view === "status-changed") {
    nextQuery = nextQuery.or(buildPendingStatesOrFilter(prefix));
  }

  if (filters.view === "closed") {
    nextQuery = nextQuery.not(`${prefix}state`, "is", null).or(
      CLOSED_TICKET_STATES.map((state) => `${prefix}state.eq.${state}`).join(",")
    );
  }

  if (filters.view === "unassigned") {
    nextQuery = nextQuery.or(buildPendingStatesOrFilter(prefix)).or(
      `${prefix}dept_list.is.null,${prefix}dept_list.eq.{}`
    );
  }

  if (filters.state) {
    nextQuery = nextQuery.eq(`${prefix}state`, filters.state);
  }

  if (filters.dept) {
    nextQuery = nextQuery.contains(`${prefix}dept_list`, [filters.dept]);
  }

  if (filters.q) {
    const escaped = filters.q.replace(/[%_]/g, "\\$&");
    const search = `%${escaped}%`;
    nextQuery = nextQuery.or(
      [
        `${prefix}ticket_id.ilike.${search}`,
        `${prefix}comment.ilike.${search}`,
        `${prefix}address.ilike.${search}`,
        `${prefix}org_response.ilike.${search}`
      ].join(",")
    );
  }

  return nextQuery;
}

export async function getCaseListData(filters: CaseListFilters): Promise<CaseListData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

  try {
    noStore();

    const supabase = createSupabaseAdminClient();
    const view = normalizeView(filters.view);
    const q = (filters.q || "").trim();
    const state = (filters.state || "").trim();
    const dept = (filters.dept || "").trim();
    const role = (filters.role || "").trim();
    const sort = normalizeCaseListSort(filters.sort);
    const page = normalizePage(filters.page);
    const pageSize = normalizePageSize(filters.pageSize);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const [latestBatchResult, filterOptions] = await Promise.all([
      supabase
        .from("import_batches")
        .select("id, imported_at, filename")
        .eq("status", "completed")
        .order("imported_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getCachedTicketFilterOptions()
    ]);

    if (latestBatchResult.error) {
      throw new Error(`โหลดรอบนำเข้าล่าสุดไม่สำเร็จ: ${latestBatchResult.error.message}`);
    }

    const latestBatch = latestBatchResult.data as { id: string; imported_at: string; filename: string | null } | null;
    const { stateOptions, departmentOptions } = filterOptions;

    if (view === "reopened" || view === "status-changed") {
      if (!latestBatch) {
        return {
          status: "ready",
          view,
          q,
          state,
          dept,
          role,
          sort,
          page,
          pageSize,
          totalCount: 0,
          latestBatch,
          stateOptions,
          departmentOptions,
          items: []
        };
      }

      const historyResult = await supabase
        .from("ticket_history")
        .select(
          "id, ticket_id, old_value, new_value, detected_at, tickets!inner(ticket_id, type, comment, address, subdistrict, district, state, org_response, dept_list, timestamp, last_activity, first_seen_at, updated_at)"
        )
        .eq("import_batch_id", latestBatch.id)
        .eq("changed_field", view === "reopened" ? "reopened" : "state")
        .order("detected_at", { ascending: false })
        .limit(5000);

      if (historyResult.error) {
        throw new Error(
          view === "reopened"
            ? `โหลดรายการเรื่องเปิดกลับไม่สำเร็จ: ${historyResult.error.message}`
            : `โหลดรายการเปลี่ยนสถานะไม่สำเร็จ: ${historyResult.error.message}`
        );
      }

      const filteredItems = ((historyResult.data as StateChangeRow[] | null) || [])
        .map((row) => {
          const ticket = normalizeTicketRelation(row.tickets);

          if (!ticket || isClosedState(ticket.state) || !doesTicketMatchListFilters(ticket, { q, state, dept, role })) {
            return null;
          }

          return {
            ...ticket,
            latestStateChange: {
              old_value: row.old_value,
              new_value: row.new_value,
              detected_at: row.detected_at
            },
            reopenedInLatestBatch: view === "reopened"
          };
        })
        .filter(Boolean) as CaseListItem[];

      filteredItems.sort((left, right) => compareCaseListItems(left, right, sort));

      return {
        status: "ready",
        view,
        q,
        state,
        dept,
        role,
        sort,
        page,
        pageSize,
        totalCount: filteredItems.length,
        latestBatch,
        stateOptions,
        departmentOptions,
        items: filteredItems.slice(from, to + 1)
      };
    }

    let ticketQuery = supabase
      .from("tickets")
      .select(
        "ticket_id, type, comment, address, subdistrict, district, state, org_response, dept_list, timestamp, last_activity, first_seen_at, updated_at",
        { count: role ? undefined : "exact" }
      );

    ticketQuery = addTicketFilters(ticketQuery, {
      q,
      state,
      dept,
      role,
      view
    });

    if (role) {
      const ticketsResult = await ticketQuery.limit(5000);
      if (ticketsResult.error) {
        throw new Error(`โหลดทะเบียนเรื่องไม่สำเร็จ: ${ticketsResult.error.message}`);
      }

      const allItems = ((ticketsResult.data as TicketRow[] | null) || [])
        .map(normalizeTicketRow)
        .filter((item) => doesTicketMatchListFilters(item, { q: "", state: "", dept, role }));

      allItems.sort((left, right) => compareCaseListItems(left, right, sort));

      return {
        status: "ready",
        view,
        q,
        state,
        dept,
        role,
        sort,
        page,
        pageSize,
        totalCount: allItems.length,
        latestBatch,
        stateOptions,
        departmentOptions,
        items: allItems.slice(from, to + 1)
      };
    }

    const sortField = getCaseSortField(sort);
    const ticketsResult = await ticketQuery
      .order(sortField, { ascending: sort.endsWith("asc"), nullsFirst: false })
      .order("ticket_id", { ascending: true })
      .range(from, to);

    if (ticketsResult.error) {
      throw new Error(`โหลดทะเบียนเรื่องไม่สำเร็จ: ${ticketsResult.error.message}`);
    }

    return {
      status: "ready",
      view,
      q,
      state,
      dept,
      role,
      sort,
      page,
      pageSize,
      totalCount: ticketsResult.count || 0,
      latestBatch,
      stateOptions,
      departmentOptions,
      items: ((ticketsResult.data as TicketRow[] | null) || []).map(normalizeTicketRow)
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "ข้อมูลทะเบียนเรื่องยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export async function getCaseDetailData(ticketId: string): Promise<CaseDetailData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

  try {
    noStore();

    const supabase = createSupabaseAdminClient();
    const [ticketResult, timelineResult] = await Promise.all([
      supabase
        .from("tickets")
        .select(
          "ticket_id, type, comment, photo_url, address, subdistrict, district, province, timestamp, last_activity, state, org_response, org_list, dept_list, star, hashtag, lat, lng, first_seen_at, updated_at"
        )
        .eq("ticket_id", ticketId)
        .maybeSingle(),
      supabase
        .from("ticket_history")
        .select("id, changed_field, old_value, new_value, detected_at, import_batch_id, import_batches(filename, imported_at)")
        .eq("ticket_id", ticketId)
        .order("detected_at", { ascending: false })
        .limit(200)
    ]);

    if (ticketResult.error) {
      throw new Error(`โหลดรายละเอียดเรื่องไม่สำเร็จ: ${ticketResult.error.message}`);
    }

    if (timelineResult.error) {
      throw new Error(`โหลดประวัติเรื่องไม่สำเร็จ: ${timelineResult.error.message}`);
    }

    if (!ticketResult.data) {
      return { status: "not_found" };
    }

    const ticket = ticketResult.data as CaseDetailTicket;
    const timeline = ((timelineResult.data as CaseTimelineRawItem[] | null) || []).map((item) => ({
      ...item,
      import_batches: Array.isArray(item.import_batches) ? item.import_batches[0] || null : item.import_batches
    }));

    return {
      status: "ready",
      ticket: {
        ...ticket,
        photo_url: getSafeHttpsUrl(ticket.photo_url),
        org_list: Array.isArray(ticket.org_list) ? ticket.org_list : [],
        dept_list: Array.isArray(ticket.dept_list) ? ticket.dept_list : []
      },
      timeline,
      stateTimeline: timeline.filter(
        (item) => item.changed_field === "state" || item.changed_field === "new_ticket" || item.changed_field === "reopened"
      )
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "ข้อมูลรายละเอียดเรื่องยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export function getCaseStatusTone(state: string | null) {
  if (!state) {
    return "neutral";
  }

  if (isClosedState(state)) {
    return "success";
  }

  return "warning";
}
