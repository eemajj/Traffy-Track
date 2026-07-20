import { getCaseListData as getRuntimeCaseListData } from "@/lib/cases/runtime";
import type { CaseListData, CaseListFilters } from "@/lib/cases/runtime";

export async function getCaseListData(filters: CaseListFilters): Promise<CaseListData> {
  return getRuntimeCaseListData(filters);
}
