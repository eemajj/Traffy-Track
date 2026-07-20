import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { buildArchivePayload, fetchAllReportRows } from "@/lib/report/query-core";
import type {
  ReportBatchDepartmentRow,
  ReportBatchItemRow,
  ReportBatchRow
} from "@/lib/report/types";

export async function archiveReportBatches(input: {
  batchIds?: string[];
  markSourceDeleted?: boolean;
} = {}) {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("ระบบยังไม่ได้ตั้งค่า Supabase");
  }

  const supabase = createSupabaseAdminClient();
  const batches = await fetchAllReportRows<ReportBatchRow>((from, to) => {
    let query = supabase
      .from("report_batches")
      .select("id, report_date, created_at, note")
      .order("report_date", { ascending: false })
      .order("id", { ascending: true });

    if (input.batchIds && input.batchIds.length > 0) {
      query = query.in("id", input.batchIds);
    }

    return query.range(from, to);
  }, "โหลดรอบรายงานเพื่อจัดเก็บ archive ไม่สำเร็จ");

  if (batches.length === 0) {
    return { archivedCount: 0 };
  }

  const batchIds = batches.map((batch) => batch.id);
  const [departments, items] = await Promise.all([
    fetchAllReportRows<ReportBatchDepartmentRow>(
      (from, to) =>
        supabase
          .from("report_batch_departments")
          .select("*")
          .in("report_batch_id", batchIds)
          .order("id", { ascending: true })
          .range(from, to),
      "โหลดฝ่ายเพื่อจัดเก็บ archive ไม่สำเร็จ"
    ),
    fetchAllReportRows<ReportBatchItemRow>(
      (from, to) =>
        supabase
          .from("report_batch_items")
          .select("id, report_batch_id, dept_name, ticket_id")
          .in("report_batch_id", batchIds)
          .order("id", { ascending: true })
          .range(from, to),
      "โหลดรายการเรื่องเพื่อจัดเก็บ archive ไม่สำเร็จ"
    )
  ]);
  const archiveRows = batches.map((batch) =>
    buildArchivePayload({
      batch,
      departments: departments.filter((department) => department.report_batch_id === batch.id),
      items: items.filter((item) => item.report_batch_id === batch.id),
      sourceDeleted: input.markSourceDeleted
    })
  );

  const upsertResult = await supabase.from("report_archives").upsert(archiveRows, {
    onConflict: "source_report_batch_id"
  });

  if (upsertResult.error) {
    throw new Error(`บันทึก report archive ไม่สำเร็จ: ${upsertResult.error.message}`);
  }

  return { archivedCount: archiveRows.length };
}
