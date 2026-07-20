import { summarizeEvidenceDepartments } from "../evidence-workflow.ts";
import type {
  ReportArchiveSort,
  ReportArchiveStatus,
  ReportBatchDepartmentRow,
  ReportBatchDetailItemRow,
  ReportBatchDetailTicketRelation,
  ReportBatchItemRow,
  ReportBatchRow
} from "./types.ts";

export const REPORT_QUERY_PAGE_SIZE = 1000;

export function normalizeReportArchiveStatus(value: string | undefined): ReportArchiveStatus {
  return value === "complete" || value === "pending" || value === "missing" || value === "review" || value === "rejected"
    ? value
    : "all";
}

export function normalizeReportArchiveSort(value: string | undefined): ReportArchiveSort {
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

export function normalizeDateFilter(value: string | undefined) {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

type ReportQueryPageResult = {
  data: unknown;
  error: { message: string } | null;
};

export async function fetchAllReportRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<ReportQueryPageResult>,
  errorMessage: string
) {
  const rows: T[] = [];

  for (let from = 0; ; from += REPORT_QUERY_PAGE_SIZE) {
    const result = await fetchPage(from, from + REPORT_QUERY_PAGE_SIZE - 1);

    if (result.error) throw new Error(`${errorMessage}: ${result.error.message}`);

    const page = (result.data as T[] | null) || [];
    rows.push(...page);
    if (page.length < REPORT_QUERY_PAGE_SIZE) break;
  }

  return rows;
}

export function resolveReportItemTicket(item: ReportBatchDetailItemRow): ReportBatchDetailTicketRelation {
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

export function buildArchivePayload(input: {
  batch: ReportBatchRow;
  departments: ReportBatchDepartmentRow[];
  items: ReportBatchItemRow[];
  sourceDeleted?: boolean;
  now?: () => string;
}) {
  const itemCountByDept = new Map<string, number>();
  for (const item of input.items) {
    itemCountByDept.set(item.dept_name, (itemCountByDept.get(item.dept_name) || 0) + 1);
  }

  const evidence = summarizeEvidenceDepartments(input.departments);
  const now = input.now || (() => new Date().toISOString());
  const archivedAt = now();

  return {
    source_report_batch_id: input.batch.id,
    report_date: input.batch.report_date,
    report_created_at: input.batch.created_at,
    archived_at: archivedAt,
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
    source_deleted_at: input.sourceDeleted ? now() : null
  };
}
