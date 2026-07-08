export const CLOSED_TICKET_STATES = ["เสร็จสิ้น", "ไม่เกี่ยวข้อง", "ส่งต่อ(ใหม่)"] as const;

export function isClosedTicketState(state: string | null) {
  return Boolean(state && CLOSED_TICKET_STATES.includes(state as (typeof CLOSED_TICKET_STATES)[number]));
}

export function buildClosedStatesFilter() {
  return `(${CLOSED_TICKET_STATES.map((state) => `"${state}"`).join(",")})`;
}
