import { getAdminOverview as getRuntimeAdminOverview } from "@/lib/admin/runtime";

export type { AdminOverviewData } from "@/lib/admin/runtime";

export async function getAdminOverview() {
  return getRuntimeAdminOverview();
}
