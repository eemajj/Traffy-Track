import { unstable_cache } from "next/cache";

import { createSupabaseAdminClient } from "@/lib/supabase";

export const TICKET_FILTER_OPTIONS_TAG = "ticket-filter-options";

const FILTER_OPTIONS_REVALIDATE_SECONDS = 5 * 60;

type TicketFilterOptionsRpc = {
  states?: unknown;
  departments?: unknown;
};

export const getCachedTicketFilterOptions = unstable_cache(
  async () => {
    const supabase = createSupabaseAdminClient();
    const result = await supabase.rpc("ticket_filter_options");

    if (result.error) {
      throw new Error(`โหลดตัวเลือกสำหรับกรองข้อมูลไม่สำเร็จ: ${result.error.message}`);
    }

    const payload = (result.data || {}) as TicketFilterOptionsRpc;
    const stateOptions = Array.isArray(payload.states)
      ? payload.states.filter((value): value is string => typeof value === "string")
      : [];
    const departmentOptions = Array.isArray(payload.departments)
      ? payload.departments.filter((value): value is string => typeof value === "string")
      : [];

    return { stateOptions, departmentOptions };
  },
  [TICKET_FILTER_OPTIONS_TAG],
  {
    revalidate: FILTER_OPTIONS_REVALIDATE_SECONDS,
    tags: [TICKET_FILTER_OPTIONS_TAG]
  }
);
