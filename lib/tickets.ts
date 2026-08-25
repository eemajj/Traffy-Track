export const CLOSED_TICKET_STATES = ["เสร็จสิ้น", "ไม่เกี่ยวข้อง", "ส่งต่อ(ใหม่)"] as const;

export function isClosedTicketState(state: string | null) {
  return Boolean(state && CLOSED_TICKET_STATES.includes(state as (typeof CLOSED_TICKET_STATES)[number]));
}

export function buildClosedStatesFilter() {
  return `(${CLOSED_TICKET_STATES.map((state) => `"${state}"`).join(",")})`;
}

export function buildPendingStatesOrFilter(prefix = "") {
  const field = `${prefix}state`;
  return `${field}.is.null,${field}.not.in.${buildClosedStatesFilter()}`;
}

/**
 * Resolves the primary department from a ticket's dept_list (Decision D3:
 * "last Thawi Watthana department" = current responsible unit).
 * Returns the last district department in the list, or the last department if
 * none match, or null if empty.
 */
export function getPrimaryDepartment(deptList: string[] | null | undefined): string | null {
  if (!deptList || !Array.isArray(deptList) || deptList.length === 0) return null;
  const districtDepts = deptList.filter((d) => typeof d === "string" && d.includes("ทวีวัฒนา"));
  return districtDepts[districtDepts.length - 1] || deptList[deptList.length - 1] || null;
}
