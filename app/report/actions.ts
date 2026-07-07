"use server";

import { redirect } from "next/navigation";

import { hasValidSessionCookie } from "@/lib/auth";
import { createReportBatch } from "@/lib/report";

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

  redirect(`/report/${result.batchId}`);
}
