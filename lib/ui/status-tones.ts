export type TicketStateTone = {
  label: string;
  bg: string;
  text: string;
  border: string;
  badgeClass: string;
  dotClass: string;
};

export const TICKET_STATE_TONES: Record<string, TicketStateTone> = {
  "รอรับเรื่อง": {
    label: "รอรับเรื่อง",
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-300",
    badgeClass: "bg-slate-100 text-slate-700 border border-slate-300",
    dotClass: "bg-slate-400"
  },
  "รับเรื่อง": {
    label: "รับเรื่อง",
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-200",
    badgeClass: "bg-blue-100 text-blue-800 border border-blue-200",
    dotClass: "bg-blue-500"
  },
  "กำลังดำเนินการ": {
    label: "กำลังดำเนินการ",
    bg: "bg-amber-50",
    text: "text-amber-900",
    border: "border-amber-200",
    badgeClass: "bg-amber-100 text-amber-900 border border-amber-200",
    dotClass: "bg-amber-500"
  },
  "ศึกษาปัญหา": {
    label: "ศึกษาปัญหา",
    bg: "bg-purple-50",
    text: "text-purple-900",
    border: "border-purple-200",
    badgeClass: "bg-purple-100 text-purple-900 border border-purple-200",
    dotClass: "bg-purple-500"
  },
  "จัดทำนโยบาย": {
    label: "จัดทำนโยบาย",
    bg: "bg-indigo-50",
    text: "text-indigo-900",
    border: "border-indigo-200",
    badgeClass: "bg-indigo-100 text-indigo-900 border border-indigo-200",
    dotClass: "bg-indigo-500"
  },
  "ของบประมาณ": {
    label: "ของบประมาณ",
    bg: "bg-indigo-50",
    text: "text-indigo-900",
    border: "border-indigo-200",
    badgeClass: "bg-indigo-100 text-indigo-900 border border-indigo-200",
    dotClass: "bg-indigo-500"
  },
  "จัดซื้อจัดจ้าง": {
    label: "จัดซื้อจัดจ้าง",
    bg: "bg-cyan-50",
    text: "text-cyan-900",
    border: "border-cyan-200",
    badgeClass: "bg-cyan-100 text-cyan-900 border border-cyan-200",
    dotClass: "bg-cyan-500"
  },
  "ขั้นตอนทางกฎหมาย": {
    label: "ขั้นตอนทางกฎหมาย",
    bg: "bg-orange-50",
    text: "text-orange-900",
    border: "border-orange-200",
    badgeClass: "bg-orange-100 text-orange-900 border border-orange-200",
    dotClass: "bg-orange-500"
  },
  "ติดตามเรื่อง": {
    label: "ติดตามเรื่อง",
    bg: "bg-teal-50",
    text: "text-teal-900",
    border: "border-teal-200",
    badgeClass: "bg-teal-100 text-teal-900 border border-teal-200",
    dotClass: "bg-teal-500"
  },
  "เสร็จสิ้น": {
    label: "เสร็จสิ้น",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
    badgeClass: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    dotClass: "bg-emerald-600"
  },
  "ส่งต่อ(ใหม่)": {
    label: "ส่งต่อ(ใหม่)",
    bg: "bg-sky-50",
    text: "text-sky-800",
    border: "border-sky-200",
    badgeClass: "bg-sky-100 text-sky-800 border border-sky-200",
    dotClass: "bg-sky-500"
  },
  "ไม่เกี่ยวข้อง": {
    label: "ไม่เกี่ยวข้อง",
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200",
    badgeClass: "bg-rose-100 text-rose-800 border border-rose-200",
    dotClass: "bg-rose-500"
  }
};

const DEFAULT_STATE_TONE: TicketStateTone = {
  label: "ไม่ระบุ",
  bg: "bg-slate-100",
  text: "text-slate-700",
  border: "border-slate-300",
  badgeClass: "bg-slate-100 text-slate-700 border border-slate-300",
  dotClass: "bg-slate-400"
};

export function getTicketStateTone(state: string | null | undefined): TicketStateTone {
  if (!state) return DEFAULT_STATE_TONE;
  return TICKET_STATE_TONES[state] || {
    ...DEFAULT_STATE_TONE,
    label: state
  };
}
