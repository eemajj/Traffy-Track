export const APP_PERMISSIONS = [
  "dashboard:view",
  "analytics:view",
  "analytics:export",
  "map:view",
  "cases:view",
  "import:manage",
  "reports:manage",
  "reports:create",
  "reports:export",
  "reports:evidence",
  "admin:manage"
  ,"admin:access"
  ,"admin:backup"
  ,"admin:operations"
  ,"system:maintenance"
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

export const PERMISSION_DETAILS: Record<
  AppPermission,
  { label: string; description: string; href: string }
> = {
  "dashboard:view": {
    label: "ภาพรวมระบบ",
    description: "ดูตัวชี้วัด งานคงค้าง และสรุปสถานการณ์",
    href: "/dashboard"
  },
  "analytics:view": {
    label: "แนวโน้มและการวิเคราะห์",
    description: "ดูแนวโน้ม อายุเรื่อง เวลาแก้ไข และพื้นที่หนาแน่น",
    href: "/analytics"
  },
  "analytics:export": {
    label: "ส่งออกสรุปผู้บริหาร",
    description: "ดาวน์โหลด Executive Summary เป็น PDF",
    href: "/analytics"
  },
  "map:view": {
    label: "แผนที่",
    description: "ดูตำแหน่งเรื่องร้องเรียนและใช้ตัวกรองบนแผนที่",
    href: "/map"
  },
  "cases:view": {
    label: "ทะเบียนเรื่อง",
    description: "ดูรายการและรายละเอียดเรื่องร้องเรียน",
    href: "/cases"
  },
  "import:manage": {
    label: "นำเข้าข้อมูล",
    description: "อัปโหลด ตรวจสอบ และประมวลผลไฟล์ CityData",
    href: "/import"
  },
  "reports:manage": {
    label: "รอบรายงาน",
    description: "สร้าง ส่งออก ติดตาม workflow และจัดการหลักฐาน",
    href: "/report"
  },
  "reports:create": {
    label: "สร้างและเปลี่ยนสถานะรอบรายงาน",
    description: "สร้างรอบรายงานและดำเนิน workflow ของรายงาน",
    href: "/report"
  },
  "reports:export": {
    label: "ส่งออกรายงาน",
    description: "ดาวน์โหลด Excel, PDF และไฟล์รวมของรอบรายงาน",
    href: "/report"
  },
  "reports:evidence": {
    label: "จัดการหลักฐาน",
    description: "อัปโหลด ตรวจ อนุมัติ ตีกลับ และถอนหลักฐาน",
    href: "/report"
  },
  "admin:manage": {
    label: "ผู้ดูแลระบบ",
    description: "จัดการ Passcode สิทธิ์ Backup และการดูแลระบบทั้งหมด",
    href: "/admin"
  },
  "admin:access": {
    label: "จัดการ Passcode",
    description: "สร้าง แก้ไข ระงับ และกำหนดอายุ Passcode",
    href: "/admin"
  },
  "admin:backup": {
    label: "สำรองข้อมูล",
    description: "สร้างและดาวน์โหลด System Backup",
    href: "/admin"
  },
  "admin:operations": {
    label: "ดูแลคิวระบบ",
    description: "รัน maintenance และจัดการงานที่ล้มเหลว",
    href: "/admin"
  },
  "system:maintenance": {
    label: "โหมดบำรุงรักษา",
    description: "เปิดหรือปิดการเขียนข้อมูลทั่วทั้งระบบ",
    href: "/admin"
  }
};

export const ACCESS_PRESETS = {
  executive: {
    label: "ผู้บริหารเขต",
    description: "สำหรับผู้อำนวยการเขตและผู้ช่วยผู้อำนวยการเขต",
    permissions: ["dashboard:view", "analytics:view", "analytics:export", "map:view"] as AppPermission[]
  },
  operator: {
    label: "เจ้าหน้าที่ปฏิบัติการ",
    description: "ทำงานข้อมูล เคส และรอบรายงาน โดยไม่เข้าหน้าผู้ดูแลระบบ",
    permissions: APP_PERMISSIONS.filter((permission) => !permission.startsWith("admin:") && permission !== "system:maintenance")
  },
  admin: {
    label: "ผู้ดูแลระบบ",
    description: "เข้าถึงทุกหน้าและจัดการ Passcode กับสิทธิ์ของผู้อื่น",
    permissions: [...APP_PERMISSIONS]
  }
} as const;

const ROUTE_PERMISSIONS: Array<{ prefix: string; permission: AppPermission }> = [
  { prefix: "/dashboard", permission: "dashboard:view" },
  { prefix: "/analytics", permission: "analytics:view" },
  { prefix: "/map", permission: "map:view" },
  { prefix: "/cases", permission: "cases:view" },
  { prefix: "/import", permission: "import:manage" },
  { prefix: "/report", permission: "reports:manage" },
  { prefix: "/admin", permission: "admin:manage" }
];

export function isAppPermission(value: unknown): value is AppPermission {
  return typeof value === "string" && APP_PERMISSIONS.includes(value as AppPermission);
}

export function normalizePermissions(values: unknown): AppPermission[] {
  if (!Array.isArray(values)) return [];
  return APP_PERMISSIONS.filter((permission) => values.includes(permission));
}

export function hasPermission(
  claims: { permissions?: readonly AppPermission[]; role?: string } | null | undefined,
  permission: AppPermission
) {
  if (!claims) return false;
  if (claims.role === "admin") return true;
  if (claims.permissions?.includes(permission) === true) return true;
  if (permission === "analytics:export" && claims.permissions?.includes("analytics:view")) return true;
  if (permission.startsWith("reports:") && claims.permissions?.includes("reports:manage")) return true;
  if (permission.startsWith("admin:") && claims.permissions?.includes("admin:manage")) return true;
  return false;
}

export function getRoutePermission(pathname: string): AppPermission | null {
  return ROUTE_PERMISSIONS.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )?.permission || null;
}

export function getFirstAllowedPath(claims: {
  permissions?: readonly AppPermission[];
  role?: string;
}) {
  for (const permission of APP_PERMISSIONS) {
    if (hasPermission(claims, permission)) return PERMISSION_DETAILS[permission].href;
  }
  return "/login?access=none";
}
