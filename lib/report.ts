import { unstable_noStore as noStore } from "next/cache";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  createSignedUploadTarget,
  REPORT_EVIDENCE_BUCKET,
  sanitizeStorageSegment
} from "@/lib/storage";
import { buildPendingStatesOrFilter } from "@/lib/tickets";
import type { SessionRole } from "@/lib/session";
import { getEvidenceWorkflowState, summarizeEvidenceDepartments } from "@/lib/evidence-workflow";

const REPORT_EVIDENCE_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);
const REPORT_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
const REPORT_QUERY_PAGE_SIZE = 1000;
const EVIDENCE_VERSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPORT_ITEM_SNAPSHOT_SELECT =
  "id, dept_name, ticket_id, snapshot_captured_at, snapshot_type, snapshot_comment, snapshot_address, snapshot_subdistrict, snapshot_timestamp, snapshot_last_activity, snapshot_state, snapshot_org_response, tickets(ticket_id, state, comment, address, subdistrict, timestamp, last_activity, org_response, type)";

type ReportBatchRow = {
  id: string;
  report_date: string;
  created_at: string;
  note: string | null;
};

export function isEvidenceVersionId(value: string) {
  return EVIDENCE_VERSION_ID_PATTERN.test(value);
}

type ReportBatchDepartmentRow = {
  id: string;
  report_batch_id: string;
  dept_name: string;
  current_evidence_version_id?: string | null;
  evidence_file_url: string | null;
  evidence_uploaded_at: string | null;
  evidence_review_status?: EvidenceReviewStatus | null;
  evidence_review_note?: string | null;
  evidence_version_number?: number | null;
  evidence_original_filename?: string | null;
  evidence_sha256?: string | null;
};

export type EvidenceReviewStatus = "pending" | "approved" | "rejected" | "legacy_unverified";

type ReportBatchItemRow = {
  id: number;
  report_batch_id: string;
  dept_name: string;
  ticket_id: string;
};

type ReportArchiveRow = {
  id: string;
  source_report_batch_id: string;
  report_date: string;
  report_created_at: string;
  archived_at: string;
  note: string | null;
  department_count: number;
  item_count: number;
  evidence_uploaded_count: number;
  evidence_pending_count: number;
  evidence_missing_count?: number;
  evidence_pending_review_count?: number;
  evidence_rejected_count?: number;
  evidence_approved_count?: number;
  completion_status: "complete" | "incomplete";
  completion_semantics?: "legacy_uploaded_v0" | "approved_v1";
  departments: Array<{
    dept_name: string;
    item_count: number;
    evidence_uploaded: boolean;
    evidence_uploaded_at: string | null;
    evidence_review_status?: EvidenceReviewStatus | null;
  }>;
  evidence_files: Array<{
    dept_name: string;
    evidence_file_url: string;
    evidence_uploaded_at: string | null;
  }>;
  source_deleted: boolean;
  source_deleted_at: string | null;
};

export type ReportArchiveStatus = "all" | "complete" | "pending" | "missing" | "review" | "rejected";
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
  type: string | null;
  state: string | null;
  comment: string | null;
  address: string | null;
  subdistrict: string | null;
  timestamp: string | null;
  last_activity: string | null;
  org_response: string | null;
};

type ReportBatchDetailItemRow = {
  id: number;
  dept_name: string;
  ticket_id: string;
  snapshot_captured_at: string | null;
  snapshot_type: string | null;
  snapshot_comment: string | null;
  snapshot_address: string | null;
  snapshot_subdistrict: string | null;
  snapshot_timestamp: string | null;
  snapshot_last_activity: string | null;
  snapshot_state: string | null;
  snapshot_org_response: string | null;
  tickets: ReportBatchDetailTicketRelation[] | ReportBatchDetailTicketRelation | null;
};

type ExportTicketRow = ReportBatchDetailItemRow;

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
        evidenceMissingCount: number;
        evidencePendingReviewCount: number;
        evidenceRejectedCount: number;
        evidenceApprovedCount: number;
        evidenceProgressPercent: number;
        completionStatus: "complete" | "incomplete";
      }>;
      archives: Array<{
        id: string;
        sourceReportBatchId: string;
        reportDate: string;
        reportCreatedAt: string;
        archivedAt: string;
        note: string | null;
        departmentCount: number;
        itemCount: number;
        evidenceUploadedCount: number;
        evidencePendingCount: number;
        evidenceMissingCount: number;
        evidencePendingReviewCount: number;
        evidenceRejectedCount: number;
        evidenceApprovedCount: number;
        evidenceSemantics: "approved_v1" | "legacy_uploaded_v0";
        completionStatus: "complete" | "incomplete";
        departments: Array<{
          deptName: string;
          itemCount: number;
          evidenceUploaded: boolean;
          evidenceUploadedAt: string | null;
          evidenceReviewStatus: EvidenceReviewStatus | null;
        }>;
        evidenceFiles: Array<{
          deptName: string;
          evidenceFileUrl: string;
          evidenceUploadedAt: string | null;
        }>;
        sourceDeleted: boolean;
        sourceDeletedAt: string | null;
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
      evidenceMissingCount: number;
      evidencePendingReviewCount: number;
      evidenceRejectedCount: number;
      evidenceApprovedCount: number;
      departments: Array<{
        id: string;
        dept_name: string;
        evidence_file_url: string | null;
        evidence_uploaded_at: string | null;
        current_evidence_version_id: string | null;
        evidence_review_status: EvidenceReviewStatus | null;
        evidence_review_note: string | null;
        evidence_version_number: number | null;
        evidence_original_filename: string | null;
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
        current_evidence_version_id: string | null;
        evidence_review_status: EvidenceReviewStatus | null;
        evidence_review_note: string | null;
        evidence_version_number: number | null;
        evidence_original_filename: string | null;
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
      evidenceMissingCount: number;
      evidencePendingReviewCount: number;
      evidenceRejectedCount: number;
      evidenceApprovedCount: number;
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
  | { status: "invalid"; message: string }
  | { status: "conflict"; message: string }
  | { status: "not_found" }
  | { status: "no_file" }
  | {
      status: "ready";
      idempotent: boolean;
      department: {
        id: string;
        dept_name: string;
        evidence_file_url: null;
        evidence_uploaded_at: null;
      };
    };

function normalizeReportArchiveStatus(value: string | undefined): ReportArchiveStatus {
  return value === "complete" || value === "pending" || value === "missing" || value === "review" || value === "rejected"
    ? value
    : "all";
}

function sanitizeDownloadFilenameSegment(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
}

async function inspectEvidenceBlob(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let contentType: string | null = null;

  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") {
    contentType = "application/pdf";
  } else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    contentType = "image/jpeg";
  } else if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    contentType = "image/png";
  } else if (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    contentType = "image/webp";
  }

  if (!contentType) {
    throw new Error("ชนิดไฟล์จริงไม่ใช่ JPG, PNG, WebP หรือ PDF ที่รองรับ");
  }

  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return {
    contentType,
    sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  };
}

async function enqueueEvidenceDeletion(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  objectPath: string,
  reason: string
) {
  const result = await supabase.from("storage_deletion_outbox").upsert(
    {
      bucket: REPORT_EVIDENCE_BUCKET,
      object_path: objectPath,
      reason,
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_error: null
    },
    { onConflict: "bucket,object_path" }
  );

  if (result.error) {
    console.error("Failed to enqueue evidence storage deletion", {
      objectPath,
      reason,
      message: result.error.message
    });
  }
}

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

  if (enhancedResult.error.code !== "42703" && enhancedResult.error.code !== "PGRST204") {
    return enhancedResult;
  }

  return supabase
    .from("report_batch_departments")
    .select(baseFields)
    .eq("report_batch_id", batchId)
    .order("dept_name", { ascending: true });
}

async function loadReportEvidenceDepartment(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  departmentId: string
) {
  return supabase
    .from("report_batch_departments")
    .select(
      "id, dept_name, evidence_file_url, evidence_uploaded_at, current_evidence_version_id, evidence_review_status, evidence_review_note, evidence_version_number, evidence_original_filename, evidence_sha256"
    )
    .eq("id", departmentId)
    .maybeSingle();
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

function buildArchivePayload(input: {
  batch: ReportBatchRow;
  departments: ReportBatchDepartmentRow[];
  items: ReportBatchItemRow[];
  sourceDeleted?: boolean;
}) {
  const itemCountByDept = new Map<string, number>();

  for (const item of input.items) {
    itemCountByDept.set(item.dept_name, (itemCountByDept.get(item.dept_name) || 0) + 1);
  }

  const evidence = summarizeEvidenceDepartments(input.departments);

  return {
    source_report_batch_id: input.batch.id,
    report_date: input.batch.report_date,
    report_created_at: input.batch.created_at,
    archived_at: new Date().toISOString(),
    note: input.batch.note,
    department_count: input.departments.length,
    item_count: input.items.length,
    evidence_uploaded_count: evidence.evidenceUploadedCount,
    evidence_pending_count: evidence.evidencePendingCount,
    evidence_missing_count: evidence.evidenceMissingCount,
    evidence_pending_review_count: evidence.evidencePendingReviewCount,
    evidence_rejected_count: evidence.evidenceRejectedCount,
    evidence_approved_count: evidence.evidenceApprovedCount,
    completion_status: evidence.completionStatus,
    completion_semantics: "approved_v1",
    departments: input.departments
      .map((department) => ({
        dept_name: department.dept_name,
        item_count: itemCountByDept.get(department.dept_name) || 0,
        evidence_uploaded: Boolean(department.evidence_uploaded_at),
        evidence_uploaded_at: department.evidence_uploaded_at,
        evidence_version_id: department.current_evidence_version_id || null,
        evidence_version_number: department.evidence_version_number || null,
        evidence_review_status: department.evidence_review_status || null,
        evidence_original_filename: department.evidence_original_filename || null,
        evidence_sha256: department.evidence_sha256 || null,
        evidence_review_note: department.evidence_review_note || null
      }))
      .sort((left, right) => left.dept_name.localeCompare(right.dept_name, "th")),
    evidence_files: input.departments
      .filter((department) => Boolean(department.evidence_file_url))
      .map((department) => ({
        dept_name: department.dept_name,
        evidence_file_url: department.evidence_file_url as string,
        evidence_uploaded_at: department.evidence_uploaded_at
      })),
    source_deleted: Boolean(input.sourceDeleted),
    source_deleted_at: input.sourceDeleted ? new Date().toISOString() : null
  };
}

function normalizeDateFilter(value: string | undefined) {
  if (!value) {
    return "";
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

type ReportQueryPageResult = {
  data: unknown;
  error: { message: string } | null;
};

async function fetchAllReportRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<ReportQueryPageResult>,
  errorMessage: string
) {
  const rows: T[] = [];

  for (let from = 0; ; from += REPORT_QUERY_PAGE_SIZE) {
    const result = await fetchPage(from, from + REPORT_QUERY_PAGE_SIZE - 1);

    if (result.error) {
      throw new Error(`${errorMessage}: ${result.error.message}`);
    }

    const page = (result.data as T[] | null) || [];
    rows.push(...page);

    if (page.length < REPORT_QUERY_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

function resolveReportItemTicket(item: ReportBatchDetailItemRow): ReportBatchDetailTicketRelation {
  const relation = Array.isArray(item.tickets) ? item.tickets[0] : item.tickets;

  if (!item.snapshot_captured_at) {
    return {
      ticket_id: item.ticket_id,
      type: relation?.type || null,
      state: relation?.state || null,
      comment: relation?.comment || null,
      address: relation?.address || null,
      subdistrict: relation?.subdistrict || null,
      timestamp: relation?.timestamp || null,
      last_activity: relation?.last_activity || null,
      org_response: relation?.org_response || null
    };
  }

  return {
    ticket_id: item.ticket_id,
    type: item.snapshot_type,
    state: item.snapshot_state,
    comment: item.snapshot_comment,
    address: item.snapshot_address,
    subdistrict: item.snapshot_subdistrict,
    timestamp: item.snapshot_timestamp,
    last_activity: item.snapshot_last_activity,
    org_response: item.snapshot_org_response
  };
}

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

export async function getReportPageData(filters: ReportPageFilters = {}): Promise<ReportPageData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

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

    let archivesQuery = supabase
      .from("report_archives")
      .select("*")
      .order("report_date", { ascending: false })
      .order("archived_at", { ascending: false })
      .limit(250);

    if (fromDate) {
      archivesQuery = archivesQuery.gte("report_date", fromDate);
    }

    if (toDate) {
      archivesQuery = archivesQuery.lte("report_date", toDate);
    }

    const [pendingCountResult, unassignedCountResult, pendingDepartmentsResult, batchesResult, archivesResult] = await Promise.all([
      supabase.from("tickets").select("ticket_id", { count: "exact", head: true }).or(pendingFilter),
      supabase
        .from("tickets")
        .select("ticket_id", { count: "exact", head: true })
        .or(pendingFilter)
        .or("dept_list.is.null,dept_list.eq.{}"),
      supabase.rpc("dashboard_pending_by_department"),
      batchesQuery,
      archivesQuery
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

    if (archivesResult.error) {
      throw new Error(`โหลดประวัติรอบรายงานไม่สำเร็จ: ${archivesResult.error.message}`);
    }

    const batches = (batchesResult.data as ReportBatchRow[] | null) || [];
    const archives = (archivesResult.data as ReportArchiveRow[] | null) || [];
    const batchIds = batches.map((batch) => batch.id);

    let departments: ReportBatchDepartmentRow[] = [];
    let items: ReportBatchItemRow[] = [];

    if (batchIds.length > 0) {
      const [departmentsResult, itemsResult] = await Promise.all([
        supabase
          .from("report_batch_departments")
          .select("*")
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
        const evidence = summarizeEvidenceDepartments(batchDepartments);

        return {
          id: batch.id,
          report_date: batch.report_date,
          created_at: batch.created_at,
          note: batch.note,
          departmentCount: batchDepartments.length,
          itemCount: batchItems.length,
          ...evidence
        };
      })
        .filter((batch) => {
          if (archiveStatus === "complete") {
            return batch.departmentCount > 0 && batch.evidencePendingCount === 0;
          }

          if (archiveStatus === "pending") {
            return batch.evidencePendingCount > 0;
          }
          if (archiveStatus === "missing") return batch.evidenceMissingCount > 0;
          if (archiveStatus === "review") return batch.evidencePendingReviewCount > 0;
          if (archiveStatus === "rejected") return batch.evidenceRejectedCount > 0;

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
      archives: archives
        .map((archive) => {
          const evidenceSemantics = archive.completion_semantics === "approved_v1"
            ? "approved_v1" as const
            : "legacy_uploaded_v0" as const;
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
        })
        .filter((archive) => {
          if (archiveStatus === "complete") {
            return archive.departmentCount > 0 && archive.evidencePendingCount === 0;
          }

          if (archiveStatus === "pending") {
            return archive.evidencePendingCount > 0;
          }
          if (archiveStatus === "missing") return archive.evidenceMissingCount > 0;
          if (archiveStatus === "review") return archive.evidencePendingReviewCount > 0;
          if (archiveStatus === "rejected") return archive.evidenceRejectedCount > 0;

          return true;
        })
        .sort((left, right) => {
          if (archiveSort === "report_date_asc") {
            return left.reportDate.localeCompare(right.reportDate) || left.archivedAt.localeCompare(right.archivedAt);
          }

          if (archiveSort === "created_at_desc") {
            return right.archivedAt.localeCompare(left.archivedAt);
          }

          if (archiveSort === "item_count_desc") {
            return right.itemCount - left.itemCount || right.reportDate.localeCompare(left.reportDate);
          }

          if (archiveSort === "progress_asc") {
            const leftProgress = left.departmentCount > 0 ? Math.round((left.evidenceApprovedCount / left.departmentCount) * 100) : 0;
            const rightProgress = right.departmentCount > 0 ? Math.round((right.evidenceApprovedCount / right.departmentCount) * 100) : 0;
            return leftProgress - rightProgress || right.reportDate.localeCompare(left.reportDate);
          }

          return right.reportDate.localeCompare(left.reportDate) || right.archivedAt.localeCompare(left.archivedAt);
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

    const [batchResult, departmentsResult, items] = await Promise.all([
      supabase.from("report_batches").select("id, report_date, created_at, note").eq("id", batchId).maybeSingle(),
      loadReportEvidenceDepartments(supabase, batchId, true),
      fetchAllReportRows<ReportBatchDetailItemRow>(
        (from, to) =>
          supabase
            .from("report_batch_items")
            .select(REPORT_ITEM_SNAPSHOT_SELECT)
            .eq("report_batch_id", batchId)
            .order("dept_name", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to),
        "โหลดรายการเรื่องในรอบรายงานไม่สำเร็จ"
      )
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

    const [batchResult, departmentResult, items] = await Promise.all([
      supabase.from("report_batches").select("id, report_date, created_at, note").eq("id", batchId).maybeSingle(),
      supabase
        .from("report_batch_departments")
        .select("dept_name, evidence_file_url, evidence_uploaded_at")
        .eq("report_batch_id", batchId)
        .eq("dept_name", deptName)
        .maybeSingle(),
      fetchAllReportRows<ExportTicketRow>(
        (from, to) =>
          supabase
            .from("report_batch_items")
            .select(REPORT_ITEM_SNAPSHOT_SELECT)
            .eq("report_batch_id", batchId)
            .eq("dept_name", deptName)
            .order("id", { ascending: true })
            .range(from, to),
        "โหลดรายการเรื่องสำหรับส่งออกไม่สำเร็จ"
      )
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

    const tickets = items
      .map((item) => {
        const ticket = resolveReportItemTicket(item);
        return {
          ticket_id: item.ticket_id,
          state: ticket.state,
          comment: ticket.comment,
          address: ticket.address,
          subdistrict: ticket.subdistrict,
          timestamp: ticket.timestamp,
          last_activity: ticket.last_activity,
          org_response: ticket.org_response,
          type: ticket.type
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
    const objectPath = `${input.batchId}/${departmentResult.data.id}/${Date.now()}-${crypto.randomUUID()}-${safeFileName}${fileExt ? `.${fileExt}` : ""}`;

    const uploadTarget = await createSignedUploadTarget({
      bucket: REPORT_EVIDENCE_BUCKET,
      path: objectPath,
      fileSizeLimit: REPORT_EVIDENCE_MAX_BYTES,
      allowedMimeTypes: [...REPORT_EVIDENCE_ALLOWED_TYPES]
    });

    const intentResult = await supabase.from("report_evidence_upload_intents").insert({
      report_batch_department_id: departmentResult.data.id,
      object_path: objectPath,
      original_filename: input.filename.trim() || "evidence",
      content_type: input.contentType,
      expected_size_bytes: input.size,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });

    if (intentResult.error) {
      throw new Error(`บันทึก upload intent ไม่สำเร็จ: ${intentResult.error.message}`);
    }

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
  actorRole: SessionRole;
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

    if (!fileResult.data) {
      await enqueueEvidenceDeletion(supabase, input.objectPath, "evidence_verification_missing_blob");
      throw new Error("ตรวจสอบไฟล์หลักฐานไม่สำเร็จ: ไม่พบข้อมูลไฟล์");
    }

    const detectedContentType = await inspectEvidenceBlob(fileResult.data);
    const attachResult = await supabase.rpc("attach_report_evidence_version", {
      p_department_id: departmentResult.data.id,
      p_object_path: input.objectPath,
      p_actual_size_bytes: fileResult.data.size,
      p_detected_content_type: detectedContentType.contentType,
      p_sha256: detectedContentType.sha256,
      p_actor_role: input.actorRole
    });

    if (attachResult.error) {
      await enqueueEvidenceDeletion(supabase, input.objectPath, "evidence_attach_failed");
      throw new Error(`บันทึกเวอร์ชันหลักฐานไม่สำเร็จ: ${attachResult.error.message}`);
    }

    const version = attachResult.data as {
      id: string;
      uploadedAt: string;
      reviewStatus: EvidenceReviewStatus;
      versionNumber: number;
      originalFilename: string;
      sha256: string;
      idempotent: boolean;
    };

    const currentDepartmentResult = await loadReportEvidenceDepartment(supabase, departmentResult.data.id);
    if (currentDepartmentResult.error) {
      throw new Error(`โหลดสถานะหลักฐานล่าสุดหลังอัปโหลดไม่สำเร็จ: ${currentDepartmentResult.error.message}`);
    }
    if (!currentDepartmentResult.data) {
      return { status: "not_found" } as const;
    }

    const currentDepartment = currentDepartmentResult.data as ReportBatchDepartmentRow;

    return {
      status: "ready" as const,
      evidenceVersionId: version.id,
      idempotent: version.idempotent === true,
      isCurrentVersion: currentDepartment.current_evidence_version_id === version.id,
      batch: batchResult.data as ReportBatchRow,
      department: {
        id: currentDepartment.id,
        dept_name: currentDepartment.dept_name,
        evidence_file_url: currentDepartment.evidence_file_url,
        evidence_uploaded_at: currentDepartment.evidence_uploaded_at,
        current_evidence_version_id: currentDepartment.current_evidence_version_id || null,
        evidence_review_status: currentDepartment.evidence_review_status || null,
        evidence_review_note: currentDepartment.evidence_review_note || null,
        evidence_version_number: currentDepartment.evidence_version_number || null,
        evidence_original_filename: currentDepartment.evidence_original_filename || null,
        evidence_sha256: currentDepartment.evidence_sha256 || null
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
      loadReportEvidenceDepartments(supabase, batchId)
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
      loadReportEvidenceDepartments(supabase, batchId, true),
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
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "สรุปรอบรายงานยังไม่พร้อมใช้งานชั่วคราว"
    };
  }
}

export async function deleteReportDepartmentEvidence(
  batchId: string,
  deptName: string,
  evidenceVersionId: string,
  reason: string,
  actorRole: SessionRole
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
        .select("id, dept_name, evidence_file_url, evidence_uploaded_at, current_evidence_version_id")
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

    const withdrawResult = await supabase.rpc("withdraw_report_evidence_v2", {
      p_department_id: departmentResult.data.id,
      p_evidence_version_id: evidenceVersionId,
      p_actor_role: actorRole,
      p_reason: reason
    });

    if (withdrawResult.error?.code === "PT409") {
      return { status: "conflict", message: withdrawResult.error.message };
    }
    if (withdrawResult.error?.code === "PT400") {
      return { status: "invalid", message: withdrawResult.error.message };
    }
    if (withdrawResult.error) {
      throw new Error(`ถอนหลักฐานไม่สำเร็จ: ${withdrawResult.error.message}`);
    }

    const withdrawal = withdrawResult.data as { idempotent?: boolean } | null;

    return {
      status: "ready",
      idempotent: withdrawal?.idempotent === true,
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

export async function reviewReportDepartmentEvidence(input: {
  batchId: string;
  deptName: string;
  evidenceVersionId: string;
  decision: "approved" | "rejected";
  note: string | null;
  actorRole: "admin";
}) {
  if (!hasSupabaseAdminEnv()) return { status: "missing_env" as const };

  try {
    const supabase = createSupabaseAdminClient();
    const departmentResult = await supabase
      .from("report_batch_departments")
      .select("id, dept_name")
      .eq("report_batch_id", input.batchId)
      .eq("dept_name", input.deptName)
      .maybeSingle();

    if (departmentResult.error) throw new Error(`โหลดฝ่ายสำหรับตรวจหลักฐานไม่สำเร็จ: ${departmentResult.error.message}`);
    if (!departmentResult.data) return { status: "not_found" as const };

    const reviewResult = await supabase.rpc("review_report_evidence_version_v2", {
      p_department_id: departmentResult.data.id,
      p_evidence_version_id: input.evidenceVersionId,
      p_decision: input.decision,
      p_note: input.note,
      p_actor_role: input.actorRole
    });

    if (reviewResult.error?.code === "PT409") {
      return {
        status: "conflict" as const,
        message: reviewResult.error.message
      };
    }
    if (reviewResult.error?.code === "PT400") {
      return {
        status: "invalid" as const,
        message: reviewResult.error.message
      };
    }
    if (reviewResult.error) throw new Error(`บันทึกผลตรวจหลักฐานไม่สำเร็จ: ${reviewResult.error.message}`);

    const review = reviewResult.data as { idempotent?: boolean } | null;

    return {
      status: "ready" as const,
      idempotent: review?.idempotent === true,
      department: {
        id: departmentResult.data.id,
        dept_name: departmentResult.data.dept_name,
        current_evidence_version_id: input.evidenceVersionId,
        evidence_review_status: input.decision,
        evidence_review_note: input.note
      }
    };
  } catch (error) {
    return {
      status: "unavailable" as const,
      message: error instanceof Error ? error.message : "ระบบตรวจหลักฐานยังไม่พร้อมใช้งานชั่วคราว"
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

export async function createReportBatch(input: {
  reportDate: string;
  note: string | null;
  idempotencyKey: string;
}) {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("ระบบยังไม่ได้ตั้งค่า Supabase");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate)) {
    throw new Error("กรุณาระบุวันที่ของรอบรายงาน");
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey)) {
    throw new Error("รหัสป้องกันการสร้างรอบรายงานซ้ำไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("create_report_batch_snapshot", {
    p_report_date: input.reportDate,
    p_note: input.note,
    p_idempotency_key: input.idempotencyKey
  });

  if (error || !data) {
    throw new Error(`สร้างรอบรายงานแบบ transaction ไม่สำเร็จ: ${error?.message || "ไม่ทราบสาเหตุ"}`);
  }

  return { batchId: String(data) };
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
  const deleteResult = await supabase.from("report_batches").delete().eq("id", batchId);

  if (deleteResult.error) {
    throw new Error(`ลบรอบรายงานไม่สำเร็จ: ${deleteResult.error.message}`);
  }

  return { batchId };
}
