import type { SessionRole } from "@/lib/session";

export const protectedRoutes = ["/import", "/dashboard", "/cases", "/map", "/report", "/admin"];

export const appNavigation: Array<{ href: string; label: string; roles: SessionRole[] }> = [
  { href: "/import", label: "นำเข้าข้อมูล", roles: ["admin", "operator"] },
  { href: "/dashboard", label: "ภาพรวมระบบ", roles: ["admin", "operator"] },
  { href: "/cases", label: "ทะเบียนเรื่อง", roles: ["admin", "operator"] },
  { href: "/map", label: "แผนที่", roles: ["admin", "operator"] },
  { href: "/report", label: "รอบรายงาน", roles: ["admin", "operator"] },
  { href: "/admin", label: "ผู้ดูแลระบบ", roles: ["admin"] }
];
