import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { resolveApiServiceResult } from "@/lib/api-service-result";
import { getReportBatchDepartmentEvidenceStatuses } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ batchId: string }> }) {
  const params = await props.params;
  const unauthorized = await requireApiSession("reports:manage");
  if (unauthorized) {
    return unauthorized;
  }

  const statusData = await getReportBatchDepartmentEvidenceStatuses(params.batchId);
  const resolution = resolveApiServiceResult(statusData, { notFoundMessage: "ไม่พบรอบรายงานที่เลือก" });
  if (!resolution.ok) {
    return NextResponse.json(resolution.error.body, { status: resolution.error.status });
  }

  return NextResponse.json(
    {
      departments: resolution.value.departments
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
