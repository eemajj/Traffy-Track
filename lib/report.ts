import { unstable_noStore as noStore } from "next/cache";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  createSignedUploadTarget,
  REPORT_EVIDENCE_BUCKET,
  sanitizeStorageSegment
} from "@/lib/storage";
import { buildClosedStatesFilter } from "@/lib/tickets";

const REPORT_EVIDENCE_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);
const REPORT_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

type PendingTicket = {
  ticket_id: string;
  dept_list: string[];
  state: string | null;
  comment: string | null;
  address: string | null;
  timestamp: string | null;
  last_activity: string | null;
};

type ReportBatchRow = {
  id: string;
  report_date: string;
  created_at: string;
  note: string | null;
};

type ReportBatchDepartmentRow = {
  id: string;
  report_batch_id: string;
  dept_name: string;
  evidence_file_url: string | null;
  evidence_uploaded_at: string | null;
};

type ReportBatchItemRow = {
  id: number;
  report_batch_id: string;
  dept_name: string;
  ticket_id: string;
};

export type ReportArchiveStatus = "all" | "complete" | "pending";
export type ReportArchiveSort =
  | "report_date_desc"
  | "report_date_asc"
  | "created_at_desc"
  | "item_count_desc"
  | "progress_asc";

export type ReportPageFilters = {
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
};

type ReportBatchDetailTicketRelation = {
  ticket_id: string;
  state: string | null;
  comment: string | null;
  address: string | null;
  timestamp: string | null;
  last_activity: string | null;
  org_response: string | null;
};

type ReportBatchDetailItemRow = {
  id: number;
  dept_name: string;
  ticket_id: string;
  tickets: ReportBatchDetailTicketRelation[] | ReportBatchDetailTicketRelation | null;
};

type ExportTicketRow = {
  id: number;
  dept_name: string;
  ticket_id: string;
  tickets: ReportBatchDetailTicketRelation[] | ReportBatchDetailTicketRelation | null;
};

export type ReportPageData =
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | {
      status: "ready";
      pendingTicketCount: number;
      unassignedPendingCount: number;
      departmentsReadyCount: number;
      pendingDepartments: Array<{ dept_name: string; pending_count: number }>;
      batches: Array<{
        id: string;
        report_date: string;
        created_at: string;
        note: string | null;
        departmentCount: number;
        itemCount: number;
        evidenceUploadedCount: number;
        evidencePendingCount: number;
        evidenceProgressPercent: number;
        completionStatus: "complete" | "incomplete";
      }>;
      filters: {
        status: ReportArchiveStatus;
        from: string;
        to: string;
        sort: ReportArchiveSort;
      };
    };

export type ReportBatchDetailData =
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | { status: "not_found" }
  | {
      status: "ready";
      batch: ReportBatchRow;
      departmentCount: number;
      itemCount: number;
      evidenceUploadedCount: number;
      departments: Array<{
        id: string;
        dept_name: string;
        evidence_file_url: string | null;
        evidence_uploaded_at: string | null;
        itemCount: number;
        tickets: Array<{
          ticket_id: string;
          state: string | null;
          comment: string | null;
          address: string | null;
          timestamp: string | null;
          last_activity: string | null;
          org_response: string | null;
        }>;
      }>;
    };

export type ReportDepartmentExportData =
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | { status: "not_found" }
  | {
      status: "ready";
      batch: ReportBatchRow;
      department: {
        dept_name: string;
        evidence_file_url: string | null;
        evidence_uploaded_at: string | null;
      };
      tickets: Array<{
        ticket_id: string;
        state: string | null;
        comment: string | null;
        address: string | null;
        subdistrict: string | null;
        timestamp: string | null;
        last_activity: string | null;
        org_response: string | null;
        type: string | null;
      }>;
    };

export type ReportDepartmentEvidenceDownloadData =
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | { status: "not_found" }
  | { status: "no_file" }
  | {
      status: "ready";
      batch: ReportBatchRow;
      department: {
        dept_name: string;
        evidence_file_url: string;
        evidence_uploaded_at: string | null;
      };
      filename: string;
      signedUrl: string;
    };

export type ReportBatchDepartmentEvidenceStatusData =
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | { status: "not_found" }
  | {
      status: "ready";
      departments: Array<{
        id: string;
        dept_name: string;
        evidence_file_url: string | null;
        evidence_uploaded_at: string | null;
      }>;
    };

export type ReportBatchSummaryData =
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | { status: "not_found" }
  | {
      status: "ready";
      batch: ReportBatchRow;
      departmentCount: number;
      itemCount: number;
      evidenceUploadedCount: number;
      evidencePendingCount: number;
      evidenceProgressPercent: number;
      uploadedDepartments: Array<{
        id: string;
        dept_name: string;
        evidence_file_url: string;
        evidence_uploaded_at: string;
      }>;
      pendingDepartments: Array<{
        id: string;
        dept_name: string;
        itemCount: number;
      }>;
    };

export type ReportDepartmentEvidenceDeleteData =
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | { status: "not_found" }
  | { status: "no_file" }
  | {
      status: "ready";
      department: {
        id: string;
        dept_name: string;
        evidence_file_url: null;
        evidence_uploaded_at: null;
      };
    };

function normalizeReportArchiveStatus(value: string | undefined): ReportArchiveStatus {
  return value === "complete" || value === "pending" ? value : "all";
}

function sanitizeDownloadFilenameSegment(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
}

function normalizeReportArchiveSort(value: string | undefined): ReportArchiveSort {
  if (
    value === "report_date_asc" ||
    value === "created_at_desc" ||
    value === "item_count_desc" ||
    value === "progress_asc"
  ) {
    return value;
  }

  return "report_date_desc";
}

function normalizeDateFilter(value: string | undefined) {
  if (!value) {
    return "";
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export async function getReportPageData(filters: ReportPageFilters = {}): Promise<ReportPageData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

  try {
    noStore();

    const supabase = createSupabaseAdminClient();
    const closedFilter = buildClosedStatesFilter();
    const archiveStatus = normalizeReportArchiveStatus(filters.status);
    const archiveSort = normalizeReportArchiveSort(filters.sort);
    const fromDate = normalizeDateFilter(filters.from);
    const toDate = normalizeDateFilter(filters.to);

    let batchesQuery = supabase
      .from("report_batches")
      .select("id, report_date, created_at, note")
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(250);

    if (fromDate) {
      batchesQuery = batchesQuery.gte("report_date", fromDate);
    }

    if (toDate) {
      batchesQuery = batchesQuery.lte("report_date", toDate);
    }

    const [pendingCountResult, unassignedCountResult, pendingDepartmentsResult, batchesResult] = await Promise.all([
      supabase.from("tickets").select("ticket_id", { count: "exact", head: true }).not("state", "in", closedFilter),
      supabase
        .from("tickets")
        .select("ticket_id", { count: "exact", head: true })
        .not("state", "in", closedFilter)
        .or("dept_list.is.null,dept_list.eq.{}"),
      supabase.rpc("dashboard_pending_by_department"),
      batchesQuery
    ]);

    if (pendingCountResult.error) {
      throw new Error(`นับจำนวนเรื่องคงค้างไม่สำเร็จ: ${pendingCountResult.error.message}`);
    }

    if (unassignedCountResult.error) {
      throw new Error(`นับจำนวนเรื่องคงค้างที่ยังไม่พบฝ่ายไม่สำเร็จ: ${unassignedCountResult.error.message}`);
    }

    if (pendingDepartmentsResult.error) {
      throw new Error(`โหลดฝ่ายที่มีเรื่องคงค้างไม่สำเร็จ: ${pendingDepartmentsResult.error.message}`);
    }

    if (batchesResult.error) {
      throw new Error(`โหลดรอบรายงานไม่สำเร็จ: ${batchesResult.error.message}`);
    }

    const batches = (batchesResult.data as ReportBatchRow[] | null) || [];
    const batchIds = batches.map((batch) => batch.id);

    let departments: ReportBatchDepartmentRow[] = [];
    let items: ReportBatchItemRow[] = [];

    if (batchIds.length > 0) {
      const [departmentsResult, itemsResult] = await Promise.all([
        supabase
          .from("report_batch_departments")
          .select("id, report_batch_id, dept_name, evidence_file_url, evidence_uploaded_at")
          .in("report_batch_id", batchIds),
        supabase.from("report_batch_items").select("id, report_batch_id, dept_name, ticket_id").in("report_batch_id", batchIds)
      ]);

      if (departmentsResult.error) {
        throw new Error(`โหลดฝ่ายในรอบรายงานไม่สำเร็จ: ${departmentsResult.error.message}`);
      }

      if (itemsResult.error) {
        throw new Error(`โหลดรายการเรื่องในรอบรายงานไม่สำเร็จ: ${itemsResult.error.message}`);
      }

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
        const evidenceUploadedCount = batchDepartments.filter((department) => Boolean(department.evidence_uploaded_at)).length;
        const evidencePendingCount = Math.max(batchDepartments.length - evidenceUploadedCount, 0);
        const evidenceProgressPercent =
          batchDepartments.length > 0 ? Math.round((evidenceUploadedCount / batchDepartments.length) * 100) : 0;

        const completionStatus: "complete" | "incomplete" =
          batchDepartments.length > 0 && evidencePendingCount === 0 ? "complete" : "incomplete";

        return {
          id: batch.id,
          report_date: batch.report_date,
          created_at: batch.created_at,
          note: batch.note,
          departmentCount: batchDepartments.length,
          itemCount: batchItems.length,
          evidenceUploadedCount,
          evidencePendingCount,
          evidenceProgressPercent,
          completionStatus
        };
      })
        .filter((batch) => {
          if (archiveStatus === "complete") {
            return batch.departmentCount > 0 && batch.evidencePendingCount === 0;
          }

          if (archiveStatus === "pending") {
            return batch.evidencePendingCount > 0;
          }

          return true;
        })
        .sort((left, right) => {
          if (archiveSort === "report_date_asc") {
            return left.report_date.localeCompare(right.report_date) || left.created_at.localeCompare(right.created_at);
          }

          if (archiveSort === "created_at_desc") {
            return right.created_at.localeCompare(left.created_at);
          }

          if (archiveSort === "item_count_desc") {
            return right.itemCount - left.itemCount || right.report_date.localeCompare(left.report_date);
          }

          if (archiveSort === "progress_asc") {
            return left.evidenceProgressPercent - right.evidenceProgressPercent || right.report_date.localeCompare(left.report_date);
          }

          return right.report_date.localeCompare(left.report_date) || right.created_at.localeCompare(left.created_at);
        }),
      filters: {
        status: archiveStatus,
        from: fromDate,
        to: toDate,
        sort: archiveSort
      }
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "ข้อมูลรอบรายงานยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export async function getReportBatchDetailData(batchId: string): Promise<ReportBatchDetailData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

  try {
    const supabase = createSupabaseAdminClient();

    const [batchResult, departmentsResult, itemsResult] = await Promise.all([
      supabase.from("report_batches").select("id, report_date, created_at, note").eq("id", batchId).maybeSingle(),
      supabase
        .from("report_batch_departments")
        .select("id, report_batch_id, dept_name, evidence_file_url, evidence_uploaded_at")
        .eq("report_batch_id", batchId)
        .order("dept_name", { ascending: true }),
      supabase
        .from("report_batch_items")
        .select("id, dept_name, ticket_id, tickets(ticket_id, state, comment, address, timestamp, last_activity, org_response)")
        .eq("report_batch_id", batchId)
        .order("dept_name", { ascending: true })
    ]);

    if (batchResult.error) {
      throw new Error(`โหลดรอบรายงานไม่สำเร็จ: ${batchResult.error.message}`);
    }

    if (!batchResult.data) {
      return { status: "not_found" };
    }

    if (departmentsResult.error) {
      throw new Error(`โหลดฝ่ายในรอบรายงานไม่สำเร็จ: ${departmentsResult.error.message}`);
    }

    if (itemsResult.error) {
      throw new Error(`โหลดรายการเรื่องในรอบรายงานไม่สำเร็จ: ${itemsResult.error.message}`);
    }

    const departments = (departmentsResult.data as ReportBatchDepartmentRow[] | null) || [];
    const items = ((itemsResult.data as ReportBatchDetailItemRow[] | null) || []).map((item) => ({
      ...item,
      tickets: Array.isArray(item.tickets) ? item.tickets : item.tickets ? [item.tickets] : []
    }));

    return {
      status: "ready",
      batch: batchResult.data as ReportBatchRow,
      departmentCount: departments.length,
      itemCount: items.length,
      evidenceUploadedCount: departments.filter((department) => Boolean(department.evidence_uploaded_at)).length,
      departments: departments.map((department) => {
        const deptItems = items.filter((item) => item.dept_name === department.dept_name);
        return {
          id: department.id,
          dept_name: department.dept_name,
          evidence_file_url: department.evidence_file_url,
          evidence_uploaded_at: department.evidence_uploaded_at,
          itemCount: deptItems.length,
          tickets: deptItems.map((item) => {
            const ticket = item.tickets[0];
            return {
              ticket_id: item.ticket_id,
              state: ticket?.state || null,
              comment: ticket?.comment || null,
              address: ticket?.address || null,
              timestamp: ticket?.timestamp || null,
              last_activity: ticket?.last_activity || null,
              org_response: ticket?.org_response || null
            };
          })
        };
      })
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "ข้อมูลรอบรายงานนี้ยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export async function getReportDepartmentExportData(
  batchId: string,
  deptName: string
): Promise<ReportDepartmentExportData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

  try {
    const supabase = createSupabaseAdminClient();

    const [batchResult, departmentResult, itemsResult] = await Promise.all([
      supabase.from("report_batches").select("id, report_date, created_at, note").eq("id", batchId).maybeSingle(),
      supabase
        .from("report_batch_departments")
        .select("dept_name, evidence_file_url, evidence_uploaded_at")
        .eq("report_batch_id", batchId)
        .eq("dept_name", deptName)
        .maybeSingle(),
      supabase
        .from("report_batch_items")
        .select(
          "id, dept_name, ticket_id, tickets(ticket_id, state, comment, address, subdistrict, timestamp, last_activity, org_response, type)"
        )
        .eq("report_batch_id", batchId)
        .eq("dept_name", deptName)
        .order("id", { ascending: true })
    ]);

    if (batchResult.error) {
      throw new Error(`โหลดรอบรายงานสำหรับส่งออกไม่สำเร็จ: ${batchResult.error.message}`);
    }

    if (!batchResult.data) {
      return { status: "not_found" };
    }

    if (departmentResult.error) {
      throw new Error(`โหลดฝ่ายสำหรับส่งออกไม่สำเร็จ: ${departmentResult.error.message}`);
    }

    if (!departmentResult.data) {
      return { status: "not_found" };
    }

    if (itemsResult.error) {
      throw new Error(`โหลดรายการเรื่องสำหรับส่งออกไม่สำเร็จ: ${itemsResult.error.message}`);
    }

    const items = ((itemsResult.data as ExportTicketRow[] | null) || []).map((item) => ({
      ...item,
      tickets: Array.isArray(item.tickets) ? item.tickets : item.tickets ? [item.tickets] : []
    }));

    const tickets = items
      .map((item) => {
        const ticket = item.tickets[0];
        return {
          ticket_id: item.ticket_id,
          state: ticket?.state || null,
          comment: ticket?.comment || null,
          address: ticket?.address || null,
          subdistrict: (ticket as ReportBatchDetailTicketRelation & { subdistrict?: string | null } | undefined)?.subdistrict || null,
          timestamp: ticket?.timestamp || null,
          last_activity: ticket?.last_activity || null,
          org_response: ticket?.org_response || null,
          type: (ticket as ReportBatchDetailTicketRelation & { type?: string | null } | undefined)?.type || null
        };
      })
      .sort((left, right) => {
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
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "ข้อมูลสำหรับส่งออกรายงานยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export async function createReportDepartmentEvidenceUpload(input: {
  batchId: string;
  deptName: string;
  filename: string;
  contentType: string;
  size: number;
}) {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" } as const;
  }

  if (!REPORT_EVIDENCE_ALLOWED_TYPES.has(input.contentType)) {
    return {
      status: "invalid_file" as const,
      message: "รองรับเฉพาะไฟล์ JPG, PNG, WebP และ PDF"
    };
  }

  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > REPORT_EVIDENCE_MAX_BYTES) {
    return {
      status: "invalid_file" as const,
      message: "ไฟล์ต้องมีขนาดไม่เกิน 10 MB"
    };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [batchResult, departmentResult] = await Promise.all([
      supabase.from("report_batches").select("id, report_date, created_at, note").eq("id", input.batchId).maybeSingle(),
      supabase
        .from("report_batch_departments")
        .select("id, dept_name, evidence_file_url, evidence_uploaded_at")
        .eq("report_batch_id", input.batchId)
        .eq("dept_name", input.deptName)
        .maybeSingle()
    ]);

    if (batchResult.error) {
      throw new Error(`โหลดรอบรายงานสำหรับอัปโหลดหลักฐานไม่สำเร็จ: ${batchResult.error.message}`);
    }

    if (!batchResult.data) {
      return { status: "not_found" } as const;
    }

    if (departmentResult.error) {
      throw new Error(`โหลดฝ่ายสำหรับอัปโหลดหลักฐานไม่สำเร็จ: ${departmentResult.error.message}`);
    }

    if (!departmentResult.data) {
      return { status: "not_found" } as const;
    }

    const fileExt = input.filename.includes(".") ? input.filename.split(".").pop()?.toLowerCase() || "" : "";
    const safeFileName = sanitizeStorageSegment(input.filename.replace(/\.[^.]+$/, "")) || "evidence";
    const objectPath = `${input.batchId}/${departmentResult.data.id}/${Date.now()}-${safeFileName}${fileExt ? `.${fileExt}` : ""}`;

    const uploadTarget = await createSignedUploadTarget({
      bucket: REPORT_EVIDENCE_BUCKET,
      path: objectPath,
      fileSizeLimit: REPORT_EVIDENCE_MAX_BYTES,
      allowedMimeTypes: [...REPORT_EVIDENCE_ALLOWED_TYPES]
    });

    return {
      status: "ready" as const,
      batch: batchResult.data as ReportBatchRow,
      department: {
        id: departmentResult.data.id,
        dept_name: departmentResult.data.dept_name,
        evidence_file_url: departmentResult.data.evidence_file_url,
        evidence_uploaded_at: departmentResult.data.evidence_uploaded_at
      },
      upload: uploadTarget
    };
  } catch (error) {
    return {
      status: "unavailable" as const,
      message: error instanceof Error ? error.message : "ระบบเตรียมอัปโหลดหลักฐานยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export async function attachReportDepartmentEvidence(input: {
  batchId: string;
  deptName: string;
  objectPath: string;
}) {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" } as const;
  }

  if (!input.objectPath.startsWith(`${input.batchId}/`)) {
    return {
      status: "invalid_file" as const,
      message: "ตำแหน่งไฟล์หลักฐานไม่ถูกต้อง"
    };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [batchResult, departmentResult] = await Promise.all([
      supabase.from("report_batches").select("id, report_date, created_at, note").eq("id", input.batchId).maybeSingle(),
      supabase
        .from("report_batch_departments")
        .select("id, dept_name, evidence_file_url, evidence_uploaded_at")
        .eq("report_batch_id", input.batchId)
        .eq("dept_name", input.deptName)
        .maybeSingle()
    ]);

    if (batchResult.error) {
      throw new Error(`โหลดรอบรายงานสำหรับบันทึกหลักฐานไม่สำเร็จ: ${batchResult.error.message}`);
    }

    if (!batchResult.data) {
      return { status: "not_found" } as const;
    }

    if (departmentResult.error) {
      throw new Error(`โหลดฝ่ายสำหรับบันทึกหลักฐานไม่สำเร็จ: ${departmentResult.error.message}`);
    }

    if (!departmentResult.data) {
      return { status: "not_found" } as const;
    }

    if (!input.objectPath.startsWith(`${input.batchId}/${departmentResult.data.id}/`)) {
      return {
        status: "invalid_file" as const,
        message: "ไฟล์หลักฐานไม่ตรงกับฝ่ายที่เลือก"
      };
    }

    const fileResult = await supabase.storage.from(REPORT_EVIDENCE_BUCKET).download(input.objectPath);

    if (fileResult.error) {
      throw new Error(`ตรวจสอบไฟล์หลักฐานไม่สำเร็จ: ${fileResult.error.message}`);
    }

    const uploadedAt = new Date().toISOString();
    const updateResult = await supabase
      .from("report_batch_departments")
      .update({
        evidence_file_url: input.objectPath,
        evidence_uploaded_at: uploadedAt
      })
      .eq("report_batch_id", input.batchId)
      .eq("dept_name", input.deptName);

    if (updateResult.error) {
      await supabase.storage.from(REPORT_EVIDENCE_BUCKET).remove([input.objectPath]);
      throw new Error(`บันทึกข้อมูลหลักฐานไม่สำเร็จ: ${updateResult.error.message}`);
    }

    if (departmentResult.data.evidence_file_url && departmentResult.data.evidence_file_url !== input.objectPath) {
      await supabase.storage.from(REPORT_EVIDENCE_BUCKET).remove([departmentResult.data.evidence_file_url]);
    }

    return {
      status: "ready" as const,
      batch: batchResult.data as ReportBatchRow,
      department: {
        id: departmentResult.data.id,
        dept_name: departmentResult.data.dept_name,
        evidence_file_url: input.objectPath,
        evidence_uploaded_at: uploadedAt
      }
    };
  } catch (error) {
    return {
      status: "unavailable" as const,
      message: error instanceof Error ? error.message : "ระบบอัปโหลดหลักฐานยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export async function getReportBatchDepartmentEvidenceStatuses(
  batchId: string
): Promise<ReportBatchDepartmentEvidenceStatusData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [batchResult, departmentsResult] = await Promise.all([
      supabase.from("report_batches").select("id").eq("id", batchId).maybeSingle(),
      supabase
        .from("report_batch_departments")
        .select("id, dept_name, evidence_file_url, evidence_uploaded_at")
        .eq("report_batch_id", batchId)
        .order("dept_name", { ascending: true })
    ]);

    if (batchResult.error) {
      throw new Error(`โหลดรอบรายงานสำหรับตรวจสถานะหลักฐานไม่สำเร็จ: ${batchResult.error.message}`);
    }

    if (!batchResult.data) {
      return { status: "not_found" };
    }

    if (departmentsResult.error) {
      throw new Error(`โหลดฝ่ายสำหรับตรวจสถานะหลักฐานไม่สำเร็จ: ${departmentsResult.error.message}`);
    }

    return {
      status: "ready",
      departments: ((departmentsResult.data as ReportBatchDepartmentRow[] | null) || []).map((department) => ({
        id: department.id,
        dept_name: department.dept_name,
        evidence_file_url: department.evidence_file_url,
        evidence_uploaded_at: department.evidence_uploaded_at
      }))
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "สถานะหลักฐานยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export async function getReportBatchSummaryData(batchId: string): Promise<ReportBatchSummaryData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [batchResult, departmentsResult, itemsResult] = await Promise.all([
      supabase.from("report_batches").select("id, report_date, created_at, note").eq("id", batchId).maybeSingle(),
      supabase
        .from("report_batch_departments")
        .select("id, report_batch_id, dept_name, evidence_file_url, evidence_uploaded_at")
        .eq("report_batch_id", batchId)
        .order("dept_name", { ascending: true }),
      supabase.from("report_batch_items").select("id, dept_name, ticket_id").eq("report_batch_id", batchId)
    ]);

    if (batchResult.error) {
      throw new Error(`โหลดสรุปรอบรายงานไม่สำเร็จ: ${batchResult.error.message}`);
    }

    if (!batchResult.data) {
      return { status: "not_found" };
    }

    if (departmentsResult.error) {
      throw new Error(`โหลดสรุปฝ่ายในรอบรายงานไม่สำเร็จ: ${departmentsResult.error.message}`);
    }

    if (itemsResult.error) {
      throw new Error(`โหลดสรุปรายการเรื่องในรอบรายงานไม่สำเร็จ: ${itemsResult.error.message}`);
    }

    const departments = (departmentsResult.data as ReportBatchDepartmentRow[] | null) || [];
    const items = (itemsResult.data as ReportBatchItemRow[] | null) || [];
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
      .filter((department) => !department.evidence_file_url || !department.evidence_uploaded_at)
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
      evidenceUploadedCount: uploadedDepartments.length,
      evidencePendingCount: pendingDepartments.length,
      evidenceProgressPercent:
        departments.length > 0 ? Math.round((uploadedDepartments.length / departments.length) * 100) : 0,
      uploadedDepartments,
      pendingDepartments
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "สรุปรอบรายงานยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export async function deleteReportDepartmentEvidence(
  batchId: string,
  deptName: string
): Promise<ReportDepartmentEvidenceDeleteData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [batchResult, departmentResult] = await Promise.all([
      supabase.from("report_batches").select("id").eq("id", batchId).maybeSingle(),
      supabase
        .from("report_batch_departments")
        .select("id, dept_name, evidence_file_url, evidence_uploaded_at")
        .eq("report_batch_id", batchId)
        .eq("dept_name", deptName)
        .maybeSingle()
    ]);

    if (batchResult.error) {
      throw new Error(`โหลดรอบรายงานสำหรับลบหลักฐานไม่สำเร็จ: ${batchResult.error.message}`);
    }

    if (!batchResult.data) {
      return { status: "not_found" };
    }

    if (departmentResult.error) {
      throw new Error(`โหลดฝ่ายสำหรับลบหลักฐานไม่สำเร็จ: ${departmentResult.error.message}`);
    }

    if (!departmentResult.data) {
      return { status: "not_found" };
    }

    if (!departmentResult.data.evidence_file_url) {
      return { status: "no_file" };
    }

    const oldObjectPath = departmentResult.data.evidence_file_url;
    const updateResult = await supabase
      .from("report_batch_departments")
      .update({
        evidence_file_url: null,
        evidence_uploaded_at: null
      })
      .eq("report_batch_id", batchId)
      .eq("dept_name", deptName);

    if (updateResult.error) {
      throw new Error(`ล้างข้อมูลหลักฐานไม่สำเร็จ: ${updateResult.error.message}`);
    }

    const removeResult = await supabase.storage.from(REPORT_EVIDENCE_BUCKET).remove([oldObjectPath]);

    if (removeResult.error) {
      throw new Error(`ล้างข้อมูลหลักฐานแล้ว แต่ลบไฟล์ในพื้นที่เก็บไฟล์ไม่สำเร็จ: ${removeResult.error.message}`);
    }

    return {
      status: "ready",
      department: {
        id: departmentResult.data.id,
        dept_name: departmentResult.data.dept_name,
        evidence_file_url: null,
        evidence_uploaded_at: null
      }
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "ระบบลบหลักฐานยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export async function getReportDepartmentEvidenceDownloadData(
  batchId: string,
  deptName: string
): Promise<ReportDepartmentEvidenceDownloadData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const [batchResult, departmentResult] = await Promise.all([
      supabase.from("report_batches").select("id, report_date, created_at, note").eq("id", batchId).maybeSingle(),
      supabase
        .from("report_batch_departments")
        .select("dept_name, evidence_file_url, evidence_uploaded_at")
        .eq("report_batch_id", batchId)
        .eq("dept_name", deptName)
        .maybeSingle()
    ]);

    if (batchResult.error) {
      throw new Error(`โหลดรอบรายงานสำหรับดาวน์โหลดหลักฐานไม่สำเร็จ: ${batchResult.error.message}`);
    }

    if (!batchResult.data) {
      return { status: "not_found" };
    }

    if (departmentResult.error) {
      throw new Error(`โหลดฝ่ายสำหรับดาวน์โหลดหลักฐานไม่สำเร็จ: ${departmentResult.error.message}`);
    }

    if (!departmentResult.data) {
      return { status: "not_found" };
    }

    if (!departmentResult.data.evidence_file_url) {
      return { status: "no_file" };
    }

    const originalExt = departmentResult.data.evidence_file_url.includes(".")
      ? `.${departmentResult.data.evidence_file_url.split(".").pop()}`
      : "";
    const filename = `evidence-${batchResult.data.report_date}-${sanitizeDownloadFilenameSegment(
      departmentResult.data.dept_name
    )}${originalExt}`;
    const downloadResult = await supabase.storage
      .from(REPORT_EVIDENCE_BUCKET)
      .createSignedUrl(departmentResult.data.evidence_file_url, 10 * 60, {
        download: filename
      });

    if (downloadResult.error || !downloadResult.data?.signedUrl) {
      throw new Error(`สร้างลิงก์ดาวน์โหลดหลักฐานไม่สำเร็จ: ${downloadResult.error?.message || "ไม่ทราบสาเหตุ"}`);
    }

    return {
      status: "ready",
      batch: batchResult.data as ReportBatchRow,
      department: {
        dept_name: departmentResult.data.dept_name,
        evidence_file_url: departmentResult.data.evidence_file_url,
        evidence_uploaded_at: departmentResult.data.evidence_uploaded_at
      },
      filename,
      signedUrl: downloadResult.data.signedUrl
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "ระบบดาวน์โหลดหลักฐานยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export async function createReportBatch(input: { reportDate: string; note: string | null }) {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("ระบบยังไม่ได้ตั้งค่า Supabase");
  }

  if (!input.reportDate) {
    throw new Error("กรุณาระบุวันที่ของรอบรายงาน");
  }

  const supabase = createSupabaseAdminClient();
  const closedFilter = buildClosedStatesFilter();

  const { data: pendingTickets, error: pendingTicketsError } = await supabase
    .from("tickets")
    .select("ticket_id, dept_list, state, comment, address, timestamp, last_activity")
    .not("state", "in", closedFilter);

  if (pendingTicketsError) {
    throw new Error(`โหลดเรื่องคงค้างไม่สำเร็จ: ${pendingTicketsError.message}`);
  }

  const reportableTickets = ((pendingTickets as PendingTicket[] | null) || []).filter(
    (ticket) => Array.isArray(ticket.dept_list) && ticket.dept_list.length > 0
  );

  if (reportableTickets.length === 0) {
    throw new Error("ยังไม่มีเรื่องคงค้างที่ระบุฝ่ายแล้วสำหรับสร้างรอบรายงาน");
  }

  const deptMap = new Map<string, string[]>();
  for (const ticket of reportableTickets) {
    const uniqueDepts = [...new Set(ticket.dept_list)];
    for (const dept of uniqueDepts) {
      const current = deptMap.get(dept) || [];
      current.push(ticket.ticket_id);
      deptMap.set(dept, current);
    }
  }

  const sortedDepartments = [...deptMap.entries()].sort(([left], [right]) => left.localeCompare(right, "th"));

  const { data: batchInsert, error: batchInsertError } = await supabase
    .from("report_batches")
    .insert({ report_date: input.reportDate, note: input.note })
    .select("id")
    .single();

  if (batchInsertError || !batchInsert) {
    throw new Error(`สร้างรอบรายงานไม่สำเร็จ: ${batchInsertError?.message || "ไม่ทราบสาเหตุ"}`);
  }

  const batchId = batchInsert.id as string;

  const departmentRows = sortedDepartments.map(([deptName]) => ({
    report_batch_id: batchId,
    dept_name: deptName
  }));

  const itemRows = sortedDepartments.flatMap(([deptName, ticketIds]) =>
    ticketIds.map((ticketId) => ({
      report_batch_id: batchId,
      dept_name: deptName,
      ticket_id: ticketId
    }))
  );

  const cleanupBatch = async () => {
    await supabase.from("report_batches").delete().eq("id", batchId);
  };

  const departmentsInsertResult = await supabase.from("report_batch_departments").insert(departmentRows);
  if (departmentsInsertResult.error) {
    await cleanupBatch();
    throw new Error(`สร้างรายการฝ่ายในรอบรายงานไม่สำเร็จ: ${departmentsInsertResult.error.message}`);
  }

  const itemsInsertResult = await supabase.from("report_batch_items").insert(itemRows);
  if (itemsInsertResult.error) {
    await cleanupBatch();
    throw new Error(`สร้างรายการเรื่องในรอบรายงานไม่สำเร็จ: ${itemsInsertResult.error.message}`);
  }

  return { batchId };
}

export async function updateReportBatch(input: {
  batchId: string;
  reportDate: string;
  note: string | null;
}) {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("ระบบยังไม่ได้ตั้งค่า Supabase");
  }

  if (!input.batchId) {
    throw new Error("ไม่พบรหัสรอบรายงานที่ต้องการแก้ไข");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate)) {
    throw new Error("กรุณาระบุวันที่รอบรายงานให้ถูกต้อง");
  }

  const supabase = createSupabaseAdminClient();
  const updateResult = await supabase
    .from("report_batches")
    .update({
      report_date: input.reportDate,
      note: input.note
    })
    .eq("id", input.batchId)
    .select("id")
    .maybeSingle();

  if (updateResult.error) {
    throw new Error(`แก้ไขรอบรายงานไม่สำเร็จ: ${updateResult.error.message}`);
  }

  if (!updateResult.data) {
    throw new Error("ไม่พบรอบรายงานที่ต้องการแก้ไข");
  }

  return { batchId: updateResult.data.id as string };
}

export async function deleteReportBatch(batchId: string) {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("ระบบยังไม่ได้ตั้งค่า Supabase");
  }

  if (!batchId) {
    throw new Error("ไม่พบรหัสรอบรายงานที่ต้องการลบ");
  }

  const supabase = createSupabaseAdminClient();
  const departmentsResult = await supabase
    .from("report_batch_departments")
    .select("evidence_file_url")
    .eq("report_batch_id", batchId);

  if (departmentsResult.error) {
    throw new Error(`โหลดข้อมูลหลักฐานก่อนลบรอบรายงานไม่สำเร็จ: ${departmentsResult.error.message}`);
  }

  const evidencePaths = ((departmentsResult.data as Array<{ evidence_file_url: string | null }> | null) || [])
    .map((department) => department.evidence_file_url)
    .filter((path): path is string => Boolean(path));

  if (evidencePaths.length > 0) {
    const removeResult = await supabase.storage.from(REPORT_EVIDENCE_BUCKET).remove(evidencePaths);

    if (removeResult.error) {
      throw new Error(`ลบไฟล์หลักฐานของรอบรายงานไม่สำเร็จ: ${removeResult.error.message}`);
    }
  }

  const deleteResult = await supabase.from("report_batches").delete().eq("id", batchId);

  if (deleteResult.error) {
    throw new Error(`ลบรอบรายงานไม่สำเร็จ: ${deleteResult.error.message}`);
  }

  return { batchId };
}
