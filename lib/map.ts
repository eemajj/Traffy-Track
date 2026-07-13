import { unstable_noStore as noStore } from "next/cache";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { getCachedTicketFilterOptions } from "@/lib/ticket-filter-options";
import { buildClosedStatesFilter, CLOSED_TICKET_STATES } from "@/lib/tickets";

const MAP_POINT_LIMIT = 10000;
const MAP_PAGE_SIZE = 1000;
const MAP_TICKET_FIELDS = "ticket_id, comment, address, state, org_response, dept_list, lat, lng, last_activity";

export type MapView = "pending" | "all" | "closed" | "unassigned";

export type MapFilters = {
  view?: string;
  q?: string;
  state?: string;
  dept?: string;
};

export type ComplaintMapPoint = {
  ticket_id: string;
  comment: string | null;
  address: string | null;
  state: string | null;
  org_response: string | null;
  dept_list: string[];
  lat: number;
  lng: number;
  last_activity: string | null;
};

export type ComplaintMapData =
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | {
      status: "ready";
      view: MapView;
      q: string;
      state: string;
      dept: string;
      points: ComplaintMapPoint[];
      stateOptions: string[];
      departmentOptions: string[];
      missingCoordinateCount: number;
      totalMatchingCount: number;
      capped: boolean;
    };

type MapTicketRow = Omit<ComplaintMapPoint, "dept_list" | "lat" | "lng"> & {
  dept_list: string[] | null;
  lat: number | string | null;
  lng: number | string | null;
};

async function getMapTicketRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  filters: { view: MapView; q: string; state: string; dept: string }
) {
  const rows: MapTicketRow[] = [];

  for (let from = 0; from < MAP_POINT_LIMIT; from += MAP_PAGE_SIZE) {
    let query = supabase
      .from("tickets")
      .select(MAP_TICKET_FIELDS)
      .order("ticket_id", { ascending: true });

    if (filters.view === "pending" || filters.view === "unassigned") {
      query = query.not("state", "in", buildClosedStatesFilter());
    }

    if (filters.view === "closed") {
      query = query.in("state", CLOSED_TICKET_STATES);
    }

    if (filters.view === "unassigned") {
      query = query.or("dept_list.is.null,dept_list.eq.{}");
    }

    if (filters.state) {
      query = query.eq("state", filters.state);
    }

    if (filters.dept) {
      query = query.contains("dept_list", [filters.dept]);
    }

    if (filters.q) {
      const escapedQuery = filters.q.replace(/[%_]/g, "\\$&");
      const search = `%${escapedQuery}%`;
      query = query.or(
        [`ticket_id.ilike.${search}`, `comment.ilike.${search}`, `address.ilike.${search}`, `org_response.ilike.${search}`].join(",")
      );
    }

    const { data, error } = await query.range(from, from + MAP_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`โหลดข้อมูลจุดร้องเรียนไม่สำเร็จ: ${error.message}`);
    }

    const page = (data as MapTicketRow[] | null) || [];
    rows.push(...page);

    if (page.length < MAP_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

function normalizeView(value: string | undefined): MapView {
  if (value === "all" || value === "closed" || value === "unassigned") {
    return value;
  }

  return "pending";
}

function normalizePoint(row: MapTicketRow): ComplaintMapPoint | null {
  const lat = typeof row.lat === "number" ? row.lat : Number(row.lat);
  const lng = typeof row.lng === "number" ? row.lng : Number(row.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return {
    ticket_id: row.ticket_id,
    comment: row.comment,
    address: row.address,
    state: row.state,
    org_response: row.org_response,
    dept_list: Array.isArray(row.dept_list) ? row.dept_list : [],
    lat,
    lng,
    last_activity: row.last_activity
  };
}

export async function getComplaintMapData(filters: MapFilters): Promise<ComplaintMapData> {
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

    const [filterOptions, mapTicketRows] = await Promise.all([
      getCachedTicketFilterOptions(),
      getMapTicketRows(supabase, { view, q, state, dept })
    ]);

    const points = mapTicketRows.map(normalizePoint).filter(Boolean) as ComplaintMapPoint[];

    return {
      status: "ready",
      view,
      q,
      state,
      dept,
      points,
      stateOptions: filterOptions.stateOptions,
      departmentOptions: filterOptions.departmentOptions,
      missingCoordinateCount: mapTicketRows.length - points.length,
      totalMatchingCount: mapTicketRows.length,
      capped: mapTicketRows.length >= MAP_POINT_LIMIT
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "ข้อมูลแผนที่ยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}
