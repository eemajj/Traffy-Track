import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { getReportBatchDepartmentEvidenceStatuses } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, props: { params: Promise<{ batchId: string }> }) {
  const params = await props.params;
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  const statusData = await getReportBatchDepartmentEvidenceStatuses(params.batchId);

  if (statusData.status === "missing_env") {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  if (statusData.status === "unavailable") {
    return NextResponse.json({ error: statusData.message }, { status: 500 });
  }

  if (statusData.status === "not_found") {
    return NextResponse.json({ error: "ไม่พบรอบรายงานที่เลือก" }, { status: 404 });
  }

  return NextResponse.json(
    {
      departments: statusData.departments
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
