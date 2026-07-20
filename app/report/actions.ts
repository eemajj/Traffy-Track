"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { hasSessionPermission } from "@/lib/auth";
import { DASHBOARD_CACHE_TAG } from "@/lib/dashboard";
import { archiveReportBatches, createReportBatch, deleteReportBatch, updateReportBatch } from "@/lib/report";
import { assertSystemWritable } from "@/lib/system-status";

export async function createReportBatchAction(formData: FormData) {
  if (!(await hasSessionPermission("reports:create"))) {
    redirect("/login?next=/report");
  }
  await assertSystemWritable();

  const reportDate = String(formData.get("report_date") || "");
  const note = String(formData.get("note") || "").trim() || null;
  const idempotencyKey = String(formData.get("idempotency_key") || "");

  const result = await createReportBatch({
    reportDate,
    note,
    idempotencyKey
  });

  revalidatePath("/report");
  revalidateTag(DASHBOARD_CACHE_TAG, { expire: 0 });
  redirect(`/report/${result.batchId}`);
}

export async function updateReportBatchAction(formData: FormData) {
  if (!(await hasSessionPermission("reports:create"))) {
    redirect("/login?next=/report");
  }
  await assertSystemWritable();

  const batchId = String(formData.get("batch_id") || "");
  const reportDate = String(formData.get("report_date") || "");
  const note = String(formData.get("note") || "").trim() || null;

  await updateReportBatch({
    batchId,
    reportDate,
    note
  });

  revalidatePath("/report");
  revalidatePath(`/report/${batchId}`);
  revalidateTag(DASHBOARD_CACHE_TAG, { expire: 0 });
  redirect("/report");
}

export async function deleteReportBatchAction(formData: FormData) {
  if (!(await hasSessionPermission("reports:create"))) {
    redirect("/login?next=/report");
  }
  await assertSystemWritable();

  const batchId = String(formData.get("batch_id") || "");

  await deleteReportBatch(batchId);

  revalidatePath("/report");
  revalidatePath(`/report/${batchId}`);
  revalidateTag(DASHBOARD_CACHE_TAG, { expire: 0 });
  redirect("/report");
}

export async function archiveReportBatchesAction() {
  if (!(await hasSessionPermission("reports:create"))) {
    redirect("/login?next=/report");
  }
  await assertSystemWritable();

  await archiveReportBatches();

  revalidatePath("/report");
  revalidateTag(DASHBOARD_CACHE_TAG, { expire: 0 });
  redirect("/report");
}
