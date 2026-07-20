import type { AppPermission } from "@/lib/access-permissions";

export const protectedRoutes = ["/import", "/dashboard", "/analytics", "/cases", "/map", "/report", "/admin"];

export const appNavigation: Array<{ href: string; label: string; permission: AppPermission }> = [
  { href: "/dashboard", label: "ภาพรวมระบบ", permission: "dashboard:view" },
  { href: "/analytics", label: "วิเคราะห์", permission: "analytics:view" },
  { href: "/map", label: "แผนที่", permission: "map:view" },
  { href: "/cases", label: "ทะเบียนเรื่อง", permission: "cases:view" },
  { href: "/import", label: "นำเข้าข้อมูล", permission: "import:manage" },
  { href: "/report", label: "รอบรายงาน", permission: "reports:manage" },
  { href: "/admin", label: "ผู้ดูแลระบบ", permission: "admin:manage" }
];
