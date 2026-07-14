import type { DataQualitySignals } from "@/lib/data-quality";

export const requiredCsvColumns = [
  "ticket_id",
  "type",
  "comment",
  "photo",
  "address",
  "subdistrict",
  "district",
  "province",
  "timestamp",
  "last_activity",
  "state",
  "org_response",
  "star",
  "hashtag",
  "coords"
] as const;

export type RequiredCsvColumn = (typeof requiredCsvColumns)[number];

export type CsvColumnMap = Partial<Record<RequiredCsvColumn, string>>;

export type CsvRow = Record<RequiredCsvColumn, string>;

export type TicketRecord = {
  ticket_id: string;
  type: string | null;
  comment: string | null;
  photo_url: string | null;
  address: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  timestamp: string | null;
  last_activity: string | null;
  state: string | null;
  org_response: string | null;
  org_list: string[];
  dept_list: string[];
  star: number | null;
  hashtag: string | null;
  lat: number | null;
  lng: number | null;
};

export type ExistingTicketSnapshot = TicketRecord;

export type TicketHistoryInsert = {
  ticket_id: string;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  import_batch_id: string;
};

export type ImportSummary = {
  filename: string;
  totalRows: number;
  processedRows: number;
  duplicateRows: number;
  newTickets: number;
  reopenedTickets: number;
  changedTickets: number;
  unchangedTickets: number;
  changedFields: number;
  importBatchId: string;
};

export type ImportJobStatus = "queued" | "running" | "completed" | "failed";

export type ImportJob = ImportSummary & {
  status: ImportJobStatus;
  errorMessage: string | null;
  importedAt: string;
  completedAt: string | null;
};

export type ImportPreview = {
  filename: string;
  bytesRead: number;
  fileSize: number | null;
  sampledRows: number;
  estimatedRows: number | null;
  headers: string[];
  mappedColumns: Partial<Record<RequiredCsvColumn, string>>;
  missingRequiredColumns: RequiredCsvColumn[];
  missingOptionalColumns: RequiredCsvColumn[];
  blankTicketIdRows: number;
  duplicateTicketIdRows: number;
  invalidTimestampRows: number;
  invalidCoordsRows: number;
  invalidStarRows: number;
  missingCoordinateRows: number;
  invalidStateRows: number;
  blankOrgResponseRows: number;
  sampledExistingTicketRows: number;
  sampledNewTicketRows: number;
  sampledChangedTicketRows: number;
  dataQualitySignals: DataQualitySignals;
  parseWarnings: string[];
  canImport: boolean;
};
