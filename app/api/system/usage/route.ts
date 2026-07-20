import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLES = [
  "tickets",
  "ticket_history",
  "import_batches",
  "report_batches",
  "report_batch_departments",
  "report_batch_items",
  "report_archives"
] as const;

export async function GET() {
  const unauthorized = await requireApiSession("admin:manage");
  if (unauthorized) {
    return unauthorized;
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json({ error: "ระบบยังไม่ได้ตั้งค่า Supabase" }, { status: 500 });
  }

  try {
    const supabase = createSupabaseAdminClient();
    const tableResults = await Promise.all(
      TABLES.map(async (table) => {
        const result = await supabase.from(table).select("*", { count: "exact", head: true });
        return {
          table,
          count: result.count || 0,
          error: result.error?.message || null
        };
      })
    );

    const hasError = tableResults.some((result) => result.error);

    return NextResponse.json(
      {
        generatedAt: new Date().toISOString(),
        status: hasError ? "degraded" : "ok",
        records: tableResults,
        limits: {
          vercel: {
            functionRequestResponse: "4.5 MB ต่อ request/response",
            recommendedPattern: "ไฟล์ import, หลักฐาน และ export ขนาดใหญ่ควรผ่าน Supabase Storage signed URL"
          },
          supabaseFreeTierWatchpoints: {
            database: "500 MB ต่อ project",
            storage: "1 GB",
            egress: "5 GB ต่อเดือน"
          }
        }
      },
      {
        status: hasError ? 500 : 200,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        error: error instanceof Error ? error.message : "โหลดข้อมูลการใช้งานระบบไม่สำเร็จ"
      },
      { status: 500 }
    );
  }
}
