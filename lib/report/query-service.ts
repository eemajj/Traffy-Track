import { unstable_noStore as noStore } from "next/cache";

import { getEvidenceWorkflowState, summarizeEvidenceDepartments } from "@/lib/evidence-workflow";
import { hasSupabaseAdminEnv } from "@/lib/env";
import {
  fetchAllReportRows,
  normalizeDateFilter,
  normalizeReportArchiveSort,
  normalizeReportArchiveStatus,
  resolveReportItemTicket
} from "@/lib/report/query-core";
import type {
  ExportTicketRow,
  ReportArchiveRow,
  ReportBatchDepartmentEvidenceStatusData,
  ReportBatchDepartmentRow,
  ReportBatchDetailData,
  ReportBatchDetailItemRow,
  ReportBatchItemRow,
  ReportBatchRow,
  ReportBatchSummaryData,
  ReportDepartmentExportData,
  ReportPageData,
  ReportPageFilters
} from "@/lib/report/types";
import { deriveDepartmentList, parseOrgList } from "@/lib/import/normalize";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { buildPendingStatesOrFilter } from "@/lib/tickets";

const REPORT_ITEM_SNAPSHOT_SELECT =
  "id, dept_name, ticket_id, snapshot_captured_at, snapshot_type, snapshot_comment, snapshot_address, snapshot_subdistrict, snapshot_timestamp, snapshot_last_activity, snapshot_state, snapshot_org_response, tickets(ticket_id, state, comment, address, subdistrict, timestamp, last_activity, org_response, type, dept_list)";

async function loadReportEvidenceDepartments(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  batchId: string,
  includeReportBatchId = false
) {
  const baseFields = `id, ${includeReportBatchId ? "report_batch_id, " : ""}dept_name, evidence_file_url, evidence_uploaded_at`;
  const enhancedResult = await supabase
    .from("report_batch_departments")
    .select(`${baseFields}, current_evidence_version_id, evidence_review_status, evidence_review_note, evidence_version_number, evidence_original_filename, evidence_sha256`)
    .eq("report_batch_id", batchId)
    .order("dept_name", { ascending: true });

  if (!enhancedResult.error) return enhancedResult;
  if (enhancedResult.error.code !== "42703" && enhancedResult.error.code !== "PGRST204") return enhancedResult;

  return supabase
    .from("report_batch_departments")
    .select(baseFields)
    .eq("report_batch_id", batchId)
    .order("dept_name", { ascending: true });
}

export async function getReportPageData(filters: ReportPageFilters = {}): Promise<ReportPageData> {
  if (!hasSupabaseAdminEnv()) return { status: "missing_env" };

  try {
    noStore();

    const supabase = createSupabaseAdminClient();
    const pendingFilter = buildPendingStatesOrFilter();
    const archiveStatus = normalizeReportArchiveStatus(filters.status);
    const archiveSort = normalizeReportArchiveSort(filters.sort);
    const fromDate = normalizeDateFilter(filters.from);
    const toDate = normalizeDateFilter(filters.to);

    let batchesQuery = supabase
      .from("report_batches")
      .select("id, report_date, created_at, note, lifecycle_status, owner, due_date, next_action, status_updated_at, locked_at")
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(250);

    if (fromDate) batchesQuery = batchesQuery.gte("report_date", fromDate);
    if (toDate) batchesQuery = batchesQuery.lte("report_date", toDate);

    let archivesQuery = supabase
      .from("report_archives")
      .select("*")
      .order("report_date", { ascending: false })
      .order("archived_at", { ascending: false })
      .limit(250);

    if (fromDate) archivesQuery = archivesQuery.gte("report_date", fromDate);
    if (toDate) archivesQuery = archivesQuery.lte("report_date", toDate);

    const [pendingCountResult, unassignedCountResult, pendingDepartmentsResult, batchesResult, archivesResult] = await Promise.all([
      supabase.from("tickets").select("ticket_id", { count: "exact", head: true }).or(pendingFilter),
      supabase.from("tickets").select("ticket_id", { count: "exact", head: true }).or(pendingFilter).or("dept_list.is.null,dept_list.eq.{}"),
      supabase.rpc("dashboard_pending_by_department"),
      batchesQuery,
      archivesQuery
    ]);

    if (pendingCountResult.error) throw new Error(`นับจำนวนเรื่องคงค้างไม่สำเร็จ: ${pendingCountResult.error.message}`);
    if (unassignedCountResult.error) throw new Error(`นับจำนวนเรื่องคงค้างที่ยังไม่พบฝ่ายไม่สำเร็จ: ${unassignedCountResult.error.message}`);
    if (pendingDepartmentsResult.error) throw new Error(`โหลดฝ่ายที่มีเรื่องคงค้างไม่สำเร็จ: ${pendingDepartmentsResult.error.message}`);
    if (batchesResult.error) throw new Error(`โหลดรอบรายงานไม่สำเร็จ: ${batchesResult.error.message}`);
    if (archivesResult.error) throw new Error(`โหลดประวัติรอบรายงานไม่สำเร็จ: ${archivesResult.error.message}`);

    const batches = (batchesResult.data as ReportBatchRow[] | null) || [];
    const archives = (archivesResult.data as ReportArchiveRow[] | null) || [];
    const batchIds = batches.map((batch) => batch.id);
    let departments: ReportBatchDepartmentRow[] = [];
    let items: ReportBatchItemRow[] = [];

    if (batchIds.length > 0) {
      const [departmentsResult, itemsResult] = await Promise.all([
        supabase.from("report_batch_departments").select("*").in("report_batch_id", batchIds),
        supabase.from("report_batch_items").select("id, report_batch_id, dept_name, ticket_id").in("report_batch_id", batchIds)
      ]);

      if (departmentsResult.error) throw new Error(`โหลดฝ่ายในรอบรายงานไม่สำเร็จ: ${departmentsResult.error.message}`);
      if (itemsResult.error) throw new Error(`โหลดรายการเรื่องในรอบรายงานไม่สำเร็จ: ${itemsResult.error.message}`);
      departments = (departmentsResult.data as ReportBatchDepartmentRow[] | null) || [];
      items = (itemsResult.data as ReportBatchItemRow[] | null) || [];
    }

    return {
      status: "ready",
      pendingTicketCount: pendingCountResult.count || 0,
      unassignedPendingCount: unassignedCountResult.count || 0,
      departmentsReadyCount: ((pendingDepartmentsResult.data as Array<{ dept_name: string; pending_count: number }> | null) || []).length,
      pendingDepartments: ((pendingDepartmentsResult.data as Array<{ dept_name: string; pending_count: number }> | null) || []).slice(0, 12),
      batches: batches.map((batch) => {
        const batchDepartments = departments.filter((department) => department.report_batch_id === batch.id);
        const batchItems = items.filter((item) => item.report_batch_id === batch.id);
        const evidence = summarizeEvidenceDepartments(batchDepartments);

        return {
          id: batch.id,
          report_date: batch.report_date,
          created_at: batch.created_at,
          note: batch.note,
          lifecycleStatus: batch.lifecycle_status || "draft",
          owner: batch.owner || null,
          dueDate: batch.due_date || null,
          nextAction: batch.next_action || null,
          departmentCount: batchDepartments.length,
          itemCount: batchItems.length,
          ...evidence
        };
      }).filter((batch) => {
        if (archiveStatus === "complete") return batch.departmentCount > 0 && batch.evidencePendingCount === 0;
        if (archiveStatus === "pending") return batch.evidencePendingCount > 0;
        if (archiveStatus === "missing") return batch.evidenceMissingCount > 0;
        if (archiveStatus === "review") return batch.evidencePendingReviewCount > 0;
        if (archiveStatus === "rejected") return batch.evidenceRejectedCount > 0;
        return true;
      }).sort((left, right) => {
        if (archiveSort === "report_date_asc") return left.report_date.localeCompare(right.report_date) || left.created_at.localeCompare(right.created_at);
        if (archiveSort === "created_at_desc") return right.created_at.localeCompare(left.created_at);
        if (archiveSort === "item_count_desc") return right.itemCount - left.itemCount || right.report_date.localeCompare(left.report_date);
        if (archiveSort === "progress_asc") return left.evidenceProgressPercent - right.evidenceProgressPercent || right.report_date.localeCompare(left.report_date);
        return right.report_date.localeCompare(left.report_date) || right.created_at.localeCompare(left.created_at);
      }),
      archives: archives.map((archive) => {
        const evidenceSemantics = archive.completion_semantics === "approved_v1" ? "approved_v1" as const : "legacy_uploaded_v0" as const;
        const evidenceMissingCount = archive.evidence_missing_count ?? archive.evidence_pending_count;
        const evidencePendingReviewCount = archive.evidence_pending_review_count ?? archive.evidence_uploaded_count;
        const evidenceRejectedCount = archive.evidence_rejected_count ?? 0;
        const evidenceApprovedCount = archive.evidence_approved_count ?? 0;
        const evidencePendingCount = archive.department_count - evidenceApprovedCount;

        return {
          id: archive.id,
          sourceReportBatchId: archive.source_report_batch_id,
          reportDate: archive.report_date,
          reportCreatedAt: archive.report_created_at,
          archivedAt: archive.archived_at,
          note: archive.note,
          departmentCount: archive.department_count,
          itemCount: archive.item_count,
          evidenceUploadedCount: archive.evidence_uploaded_count,
          evidencePendingCount,
          evidenceMissingCount,
          evidencePendingReviewCount,
          evidenceRejectedCount,
          evidenceApprovedCount,
          evidenceSemantics,
          completionStatus: evidenceSemantics === "approved_v1" ? archive.completion_status : "incomplete" as const,
          departments: archive.departments.map((department) => ({
            deptName: department.dept_name,
            itemCount: department.item_count,
            evidenceUploaded: department.evidence_uploaded,
            evidenceUploadedAt: department.evidence_uploaded_at,
            evidenceReviewStatus: department.evidence_review_status || null
          })),
          evidenceFiles: archive.evidence_files.map((file) => ({
            deptName: file.dept_name,
            evidenceFileUrl: file.evidence_file_url,
            evidenceUploadedAt: file.evidence_uploaded_at
          })),
          sourceDeleted: archive.source_deleted,
          sourceDeletedAt: archive.source_deleted_at
        };
      }).filter((archive) => {
        if (archiveStatus === "complete") return archive.departmentCount > 0 && archive.evidencePendingCount === 0;
        if (archiveStatus === "pending") return archive.evidencePendingCount > 0;
        if (archiveStatus === "missing") return archive.evidenceMissingCount > 0;
        if (archiveStatus === "review") return archive.evidencePendingReviewCount > 0;
        if (archiveStatus === "rejected") return archive.evidenceRejectedCount > 0;
        return true;
      }).sort((left, right) => {
        if (archiveSort === "report_date_asc") return left.reportDate.localeCompare(right.reportDate) || left.archivedAt.localeCompare(right.archivedAt);
        if (archiveSort === "created_at_desc") return right.archivedAt.localeCompare(left.archivedAt);
        if (archiveSort === "item_count_desc") return right.itemCount - left.itemCount || right.reportDate.localeCompare(left.reportDate);
        if (archiveSort === "progress_asc") {
          const leftProgress = left.departmentCount > 0 ? Math.round((left.evidenceApprovedCount / left.departmentCount) * 100) : 0;
          const rightProgress = right.departmentCount > 0 ? Math.round((right.evidenceApprovedCount / right.departmentCount) * 100) : 0;
          return leftProgress - rightProgress || right.reportDate.localeCompare(left.reportDate);
        }
        return right.reportDate.localeCompare(left.reportDate) || right.archivedAt.localeCompare(left.archivedAt);
      }),
      filters: { status: archiveStatus, from: fromDate, to: toDate, sort: archiveSort }
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "ข้อมูลรอบรายงานยังไม่พร้อมใช้งานชั่วคราว" };
  }
}

export async function getReportBatchDetailData(batchId: string): Promise<ReportBatchDetailData> {
  if (!hasSupabaseAdminEnv()) return { status: "missing_env" };

  try {
    const supabase = createSupabaseAdminClient();
    const [batchResult, departmentsResult, items] = await Promise.all([
      supabase
        .from("report_batches")
        .select("id, report_date, created_at, note, lifecycle_status, owner, due_date, next_action, status_updated_at, locked_at")
        .eq("id", batchId)
        .maybeSingle(),
      loadReportEvidenceDepartments(supabase, batchId, true),
      fetchAllReportRows<ReportBatchDetailItemRow>(
        (from, to) => supabase
          .from("report_batch_items")
          .select(REPORT_ITEM_SNAPSHOT_SELECT)
          .eq("report_batch_id", batchId)
          .order("dept_name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
        "โหลดรายการเรื่องในรอบรายงานไม่สำเร็จ"
      )
    ]);

    if (batchResult.error) throw new Error(`โหลดรอบรายงานไม่สำเร็จ: ${batchResult.error.message}`);
    if (!batchResult.data) return { status: "not_found" };
    if (departmentsResult.error) throw new Error(`โหลดฝ่ายในรอบรายงานไม่สำเร็จ: ${departmentsResult.error.message}`);

    const departments = (departmentsResult.data as unknown as ReportBatchDepartmentRow[] | null) || [];
    const evidence = summarizeEvidenceDepartments(departments);

    return {
      status: "ready",
      batch: batchResult.data as ReportBatchRow,
      departmentCount: departments.length,
      itemCount: items.length,
      evidenceUploadedCount: evidence.evidenceUploadedCount,
      evidenceMissingCount: evidence.evidenceMissingCount,
      evidencePendingReviewCount: evidence.evidencePendingReviewCount,
      evidenceRejectedCount: evidence.evidenceRejectedCount,
      evidenceApprovedCount: evidence.evidenceApprovedCount,
      departments: departments.map((department) => {
        const deptItems = items.filter((item) => item.dept_name === department.dept_name);
        return {
          id: department.id,
          dept_name: department.dept_name,
          evidence_file_url: department.evidence_file_url,
          evidence_uploaded_at: department.evidence_uploaded_at,
          current_evidence_version_id: department.current_evidence_version_id || null,
          evidence_review_status: department.evidence_review_status || null,
          evidence_review_note: department.evidence_review_note || null,
          evidence_version_number: department.evidence_version_number || null,
          evidence_original_filename: department.evidence_original_filename || null,
          itemCount: deptItems.length,
          tickets: deptItems.map((item) => {
            const ticket = resolveReportItemTicket(item);
            return {
              ticket_id: item.ticket_id,
              state: ticket.state,
              comment: ticket.comment,
              address: ticket.address,
              timestamp: ticket.timestamp,
              last_activity: ticket.last_activity,
              org_response: ticket.org_response
            };
          })
        };
      })
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "ข้อมูลรอบรายงานนี้ยังไม่พร้อมใช้งานชั่วคราว" };
  }
}

export async function getReportDepartmentExportData(
  batchId: string,
  deptName: string
): Promise<ReportDepartmentExportData> {
  if (!hasSupabaseAdminEnv()) return { status: "missing_env" };

  try {
    const supabase = createSupabaseAdminClient();
    const [batchResult, departmentResult, items] = await Promise.all([
      supabase.from("report_batches").select("id, report_date, created_at, note").eq("id", batchId).maybeSingle(),
      supabase
        .from("report_batch_departments")
        .select("dept_name, evidence_file_url, evidence_uploaded_at")
        .eq("report_batch_id", batchId)
        .eq("dept_name", deptName)
        .maybeSingle(),
      fetchAllReportRows<ExportTicketRow>(
        (from, to) => supabase
          .from("report_batch_items")
          .select(REPORT_ITEM_SNAPSHOT_SELECT)
          .eq("report_batch_id", batchId)
          .eq("dept_name", deptName)
          .order("id", { ascending: true })
          .range(from, to),
        "โหลดรายการเรื่องสำหรับส่งออกไม่สำเร็จ"
      )
    ]);

    if (batchResult.error) throw new Error(`โหลดรอบรายงานสำหรับส่งออกไม่สำเร็จ: ${batchResult.error.message}`);
    if (!batchResult.data) return { status: "not_found" };
    if (departmentResult.error) throw new Error(`โหลดฝ่ายสำหรับส่งออกไม่สำเร็จ: ${departmentResult.error.message}`);
    if (!departmentResult.data) return { status: "not_found" };

    const tickets = items.map((item) => {
      const ticket = resolveReportItemTicket(item);
      const rawDeptList = (item.tickets && !Array.isArray(item.tickets) && Array.isArray(item.tickets.dept_list))
        ? item.tickets.dept_list
        : [];
      const deptList = rawDeptList.length > 0
        ? rawDeptList
        : deriveDepartmentList(parseOrgList(ticket.org_response || ""));

      return {
        ticket_id: item.ticket_id,
        state: ticket.state,
        comment: ticket.comment,
        address: ticket.address,
        subdistrict: ticket.subdistrict,
        timestamp: ticket.timestamp,
        last_activity: ticket.last_activity,
        org_response: ticket.org_response,
        type: ticket.type,
        dept_list: deptList
      };
    }).sort((left, right) => {
      const leftTime = left.timestamp ? new Date(left.timestamp).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.timestamp ? new Date(right.timestamp).getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });

    return {
      status: "ready",
      batch: batchResult.data as ReportBatchRow,
      department: {
        dept_name: departmentResult.data.dept_name,
        evidence_file_url: departmentResult.data.evidence_file_url,
        evidence_uploaded_at: departmentResult.data.evidence_uploaded_at
      },
      tickets
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "ข้อมูลสำหรับส่งออกรายงานยังไม่พร้อมใช้งานชั่วคราว" };
  }
}

export async function getReportBatchDepartmentEvidenceStatuses(
  batchId: string
): Promise<ReportBatchDepartmentEvidenceStatusData> {
  if (!hasSupabaseAdminEnv()) return { status: "missing_env" };

  try {
    const supabase = createSupabaseAdminClient();
    const [batchResult, departmentsResult] = await Promise.all([
      supabase.from("report_batches").select("id").eq("id", batchId).maybeSingle(),
      loadReportEvidenceDepartments(supabase, batchId)
    ]);

    if (batchResult.error) throw new Error(`โหลดรอบรายงานสำหรับตรวจสถานะหลักฐานไม่สำเร็จ: ${batchResult.error.message}`);
    if (!batchResult.data) return { status: "not_found" };
    if (departmentsResult.error) throw new Error(`โหลดฝ่ายสำหรับตรวจสถานะหลักฐานไม่สำเร็จ: ${departmentsResult.error.message}`);

    return {
      status: "ready",
      departments: ((departmentsResult.data as unknown as ReportBatchDepartmentRow[] | null) || []).map((department) => ({
        id: department.id,
        dept_name: department.dept_name,
        evidence_file_url: department.evidence_file_url,
        evidence_uploaded_at: department.evidence_uploaded_at,
        current_evidence_version_id: department.current_evidence_version_id || null,
        evidence_review_status: department.evidence_review_status || null,
        evidence_review_note: department.evidence_review_note || null,
        evidence_version_number: department.evidence_version_number || null,
        evidence_original_filename: department.evidence_original_filename || null
      }))
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "สถานะหลักฐานยังไม่พร้อมใช้งานชั่วคราว" };
  }
}

export async function getReportBatchSummaryData(batchId: string): Promise<ReportBatchSummaryData> {
  if (!hasSupabaseAdminEnv()) return { status: "missing_env" };

  try {
    const supabase = createSupabaseAdminClient();
    const [batchResult, departmentsResult, itemsResult] = await Promise.all([
      supabase.from("report_batches").select("id, report_date, created_at, note").eq("id", batchId).maybeSingle(),
      loadReportEvidenceDepartments(supabase, batchId, true),
      supabase.from("report_batch_items").select("id, dept_name, ticket_id").eq("report_batch_id", batchId)
    ]);

    if (batchResult.error) throw new Error(`โหลดสรุปรอบรายงานไม่สำเร็จ: ${batchResult.error.message}`);
    if (!batchResult.data) return { status: "not_found" };
    if (departmentsResult.error) throw new Error(`โหลดสรุปฝ่ายในรอบรายงานไม่สำเร็จ: ${departmentsResult.error.message}`);
    if (itemsResult.error) throw new Error(`โหลดสรุปรายการเรื่องในรอบรายงานไม่สำเร็จ: ${itemsResult.error.message}`);

    const departments = (departmentsResult.data as unknown as ReportBatchDepartmentRow[] | null) || [];
    const items = (itemsResult.data as ReportBatchItemRow[] | null) || [];
    const evidence = summarizeEvidenceDepartments(departments);
    const itemCountByDept = new Map<string, number>();
    for (const item of items) {
      itemCountByDept.set(item.dept_name, (itemCountByDept.get(item.dept_name) || 0) + 1);
    }

    const uploadedDepartments = departments
      .filter((department) => Boolean(department.evidence_file_url && department.evidence_uploaded_at))
      .map((department) => ({
        id: department.id,
        dept_name: department.dept_name,
        evidence_file_url: department.evidence_file_url as string,
        evidence_uploaded_at: department.evidence_uploaded_at as string
      }));
    const pendingDepartments = departments
      .filter((department) => getEvidenceWorkflowState(department) !== "approved")
      .map((department) => ({
        id: department.id,
        dept_name: department.dept_name,
        itemCount: itemCountByDept.get(department.dept_name) || 0
      }));

    return {
      status: "ready",
      batch: batchResult.data as ReportBatchRow,
      departmentCount: departments.length,
      itemCount: items.length,
      evidenceUploadedCount: evidence.evidenceUploadedCount,
      evidencePendingCount: evidence.evidencePendingCount,
      evidenceMissingCount: evidence.evidenceMissingCount,
      evidencePendingReviewCount: evidence.evidencePendingReviewCount,
      evidenceRejectedCount: evidence.evidenceRejectedCount,
      evidenceApprovedCount: evidence.evidenceApprovedCount,
      evidenceProgressPercent: evidence.evidenceProgressPercent,
      uploadedDepartments,
      pendingDepartments
    };
  } catch (error) {
    return { status: "unavailable", message: error instanceof Error ? error.message : "สรุปรอบรายงานยังไม่พร้อมใช้งานชั่วคราว" };
  }
}
