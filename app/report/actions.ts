"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasValidSessionCookie } from "@/lib/auth";
import { createReportBatch, deleteReportBatch, updateReportBatch } from "@/lib/report";

export async function createReportBatchAction(formData: FormData) {
  if (!(await hasValidSessionCookie())) {
    redirect("/login?next=/report");
  }

  const reportDate = String(formData.get("report_date") || "");
  const note = String(formData.get("note") || "").trim() || null;

  const result = await createReportBatch({
    reportDate,
    note
  });

  revalidatePath("/report");
  redirect(`/report/${result.batchId}`);
}

export async function updateReportBatchAction(formData: FormData) {
  if (!(await hasValidSessionCookie())) {
    redirect("/login?next=/report");
  }

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
  redirect("/report");
}

export async function deleteReportBatchAction(formData: FormData) {
  if (!(await hasValidSessionCookie())) {
    redirect("/login?next=/report");
  }

  const batchId = String(formData.get("batch_id") || "");

  await deleteReportBatch(batchId);

  revalidatePath("/report");
  revalidatePath(`/report/${batchId}`);
  redirect("/report");
}
