import { getCaseDetailData as getRuntimeCaseDetailData } from "@/lib/cases/runtime";
import type { CaseDetailData } from "@/lib/cases/runtime";

export async function getCaseDetailData(ticketId: string): Promise<CaseDetailData> {
  return getRuntimeCaseDetailData(ticketId);
}
