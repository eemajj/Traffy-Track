import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { getImportJob } from "@/lib/import/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, props: { params: Promise<{ batchId: string }> }) {
  const params = await props.params;
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const job = await getImportJob(params.batchId);

    if (!job) {
      return NextResponse.json({ error: "ไม่พบรอบนำเข้าที่เลือก" }, { status: 404 });
    }

    return NextResponse.json(job, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "โหลดสถานะรอบนำเข้าไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
