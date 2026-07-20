export type ReportExportFormat = "xlsx" | "pdf" | "zip";

type ReportExportAuditInput = {
  batchId: string;
  format: ReportExportFormat;
};

export function buildReportExportSuccessAudit(
  input: ReportExportAuditInput & { metadata: Record<string, unknown> }
) {
  return {
    action: "report.exported",
    resourceType: "report_batch",
    resourceId: input.batchId,
    metadata: { ...input.metadata, format: input.format }
  };
}

export function buildReportExportFailureAudit(
  input: ReportExportAuditInput & { error: unknown }
) {
  return {
    action: "report.export_failed",
    resourceType: "report_batch",
    resourceId: input.batchId,
    outcome: "failure" as const,
    metadata: {
      format: input.format,
      message: input.error instanceof Error ? input.error.message : "unknown error"
    }
  };
}
