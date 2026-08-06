import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, props: { params: Promise<{ ticketId: string }> }) {
  const params = await props.params;
  const unauthorized = await requireApiSession("reports:manage");
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data: ticket, error } = await supabase
      .from("tickets")
      .select("ticket_id, state, org_response, dept_list, updated_at")
      .eq("ticket_id", params.ticketId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: `ไม่สามารถตรวจสอบสถานะเรื่องได้: ${error.message}` }, { status: 500 });
    }

    if (!ticket) {
      return NextResponse.json({ error: "ไม่พบเรื่องนี้ในฐานข้อมูล" }, { status: 404 });
    }

    return NextResponse.json({
      reconciled: true,
      ticket_id: ticket.ticket_id,
      state: ticket.state,
      org_response: ticket.org_response,
      dept_list: ticket.dept_list,
      updated_at: ticket.updated_at,
      checked_at: new Date().toISOString()
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการตรวจสอบสถานะ" },
      { status: 500 }
    );
  }
}
