import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { requireApiSession } from "@/lib/api-auth";
import { processImportCsv } from "@/lib/import/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession();
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "ไม่พบไฟล์ CSV สำหรับนำเข้า" }, { status: 400 });
    }

    const summary = await processImportCsv(file);
    revalidatePath("/dashboard");
    revalidatePath("/report");

    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "นำเข้าข้อมูลไม่สำเร็จโดยไม่ทราบสาเหตุ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
