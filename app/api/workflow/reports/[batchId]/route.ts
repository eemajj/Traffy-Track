import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";

import { hasPermission } from "@/lib/access-permissions";
import { getCurrentSessionClaims } from "@/lib/auth";
import { DASHBOARD_CACHE_TAG } from "@/lib/dashboard";
import {
  getReportWorkflowHistory,
  isReportWorkflowStatus,
  transitionReportWorkflow,
  updateReportWorkflowMetadata
} from "@/lib/workflow";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const claims = await getCurrentSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(claims, "reports:manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { batchId } = await context.params;
    return NextResponse.json({ events: await getReportWorkflowHistory(batchId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "โหลด workflow ไม่สำเร็จ" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const claims = await getCurrentSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(claims, "reports:create")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const [{ batchId }, body] = await Promise.all([context.params, request.json() as Promise<Record<string, unknown>>]);
    const common = {
      batchId,
      owner: typeof body.owner === "string" ? body.owner : null,
      dueDate: typeof body.dueDate === "string" && body.dueDate ? body.dueDate : null,
      nextAction: typeof body.nextAction === "string" ? body.nextAction : null,
      note: typeof body.note === "string" ? body.note : null,
      actorRole: claims.role
    };

    let result;
    if (body.operation === "metadata") {
      result = await updateReportWorkflowMetadata({ ...common, owner: common.owner || "" });
    } else {
      if (!isReportWorkflowStatus(body.toStatus) || body.toStatus === "draft") {
        return NextResponse.json({ error: "สถานะปลายทางไม่ถูกต้อง" }, { status: 400 });
      }
      if (body.toStatus === "locked" && claims.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      result = await transitionReportWorkflow({ ...common, toStatus: body.toStatus });
    }
    revalidatePath("/dashboard");
    revalidatePath(`/report/${batchId}`);
    revalidateTag(DASHBOARD_CACHE_TAG, { expire: 0 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "บันทึก workflow ไม่สำเร็จ" }, { status: 400 });
  }
}
