export type ReportBatchRow = {
  id: string;
  report_date: string;
  created_at: string;
  note: string | null;
  lifecycle_status?: "draft" | "sent" | "partially_returned" | "complete" | "locked";
  owner?: string | null;
  due_date?: string | null;
  next_action?: string | null;
  status_updated_at?: string;
  locked_at?: string | null;
};

export type EvidenceReviewStatus = "pending" | "approved" | "rejected" | "legacy_unverified";

export type ReportBatchDepartmentRow = {
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

export type ReportBatchItemRow = {
  id: number;
  report_batch_id: string;
  dept_name: string;
  ticket_id: string;
};

export type ReportArchiveRow = {
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

export type ReportBatchDetailTicketRelation = {
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

export type ReportBatchDetailItemRow = {
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

export type ExportTicketRow = ReportBatchDetailItemRow;

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
        lifecycleStatus: "draft" | "sent" | "partially_returned" | "complete" | "locked";
        owner: string | null;
        dueDate: string | null;
        nextAction: string | null;
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
