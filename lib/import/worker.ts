import { recordAuditEvent } from "@/lib/audit";
import {
  deleteImportSourceIfTerminal,
  processImportCsvFromStorage
} from "@/lib/import/process";
import { finalizeStagedImportBatch, stageImportBatchTransaction } from "@/lib/import/staging-service";
import { createSupabaseAdminClient } from "@/lib/supabase";

const IMPORT_LEASE_SECONDS = 120;

type ClaimedImportBatch = {
  id: string;
  filename: string | null;
  storage_path: string;
  lease_token: string;
  attempt_count: number;
  locked_until: string;
  processing_phase?: "staging" | "finalizing" | null;
  pipeline_version?: 1 | 2;
};

type ReleaseResult = {
  released?: boolean;
  reason?: string;
  status?: "queued" | "failed";
  attemptCount?: number;
  maxAttempts?: number;
  retryAfterSeconds?: number | null;
};

export type ImportWorkerResult = {
  claimed: number;
  completed: number;
  staged: number;
  retried: number;
  failed: number;
  leaseLost: number;
  jobs: Array<{
    importBatchId: string;
    status: "completed" | "staged" | "queued" | "failed" | "lease_lost";
    attemptCount: number;
    message?: string;
  }>;
};

const NON_RETRYABLE_IMPORT_ERRORS = [
  "CSV parse error",
  "CSV does not contain any valid rows",
  "missing required",
  "CSV มีข้อมูลไม่ถูกต้อง"
];

export function isRetryableImportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return !NON_RETRYABLE_IMPORT_ERRORS.some((fragment) => message.includes(fragment));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "นำเข้าข้อมูลไม่สำเร็จโดยไม่ทราบสาเหตุ";
}

export async function runDurableImportWorker(limit = 1): Promise<ImportWorkerResult> {
  const supabase = createSupabaseAdminClient();
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 10);
  const v2ClaimResult = await supabase.rpc("claim_import_batches_v2", {
    p_limit: boundedLimit,
    p_lease_seconds: IMPORT_LEASE_SECONDS
  });

  if (v2ClaimResult.error) {
    throw new Error(`รับงานนำเข้า V2 จากคิวไม่สำเร็จ: ${v2ClaimResult.error.message}`);
  }

  let claimedRows = (v2ClaimResult.data || []) as ClaimedImportBatch[];
  if (claimedRows.length === 0) {
    const legacyClaimResult = await supabase.rpc("claim_import_batches", {
      p_limit: boundedLimit,
      p_lease_seconds: IMPORT_LEASE_SECONDS
    });
    if (legacyClaimResult.error) {
      throw new Error(`รับงานนำเข้าจากคิวไม่สำเร็จ: ${legacyClaimResult.error.message}`);
    }
    claimedRows = ((legacyClaimResult.data || []) as ClaimedImportBatch[]).map((job) => ({
      ...job,
      pipeline_version: 1
    }));
  } else {
    claimedRows = claimedRows.map((job) => ({ ...job, pipeline_version: 2 }));
  }

  const jobs = claimedRows.filter(
    (job) => Boolean(job.id && job.storage_path && job.lease_token)
  );
  const result: ImportWorkerResult = {
    claimed: jobs.length,
    completed: 0,
    staged: 0,
    retried: 0,
    failed: 0,
    leaseLost: 0,
    jobs: []
  };

  for (const job of jobs) {
    const filename = job.filename || "import.csv";
    try {
      if (job.pipeline_version === 2 && job.processing_phase === "finalizing") {
        await finalizeStagedImportBatch({ importBatchId: job.id, leaseToken: job.lease_token });
        await deleteImportSourceIfTerminal({ path: job.storage_path, importBatchId: job.id });
        result.completed += 1;
        result.jobs.push({
          importBatchId: job.id,
          status: "completed",
          attemptCount: job.attempt_count
        });
        await recordAuditEvent({
          action: "import.completed",
          resourceType: "import_batch",
          resourceId: job.id,
          actorRole: "system",
          metadata: { filename, attemptCount: job.attempt_count, consumer: "durable-cron-v2" }
        });
        continue;
      }

      const summary = await processImportCsvFromStorage({
        path: job.storage_path,
        filename,
        importBatchId: job.id,
        leaseToken: job.lease_token,
        apply: job.pipeline_version === 2
          ? (input) => stageImportBatchTransaction({ ...input, leaseToken: job.lease_token })
          : undefined
      });

      if (job.pipeline_version === 2) {
        result.staged += 1;
        result.jobs.push({
          importBatchId: job.id,
          status: "staged",
          attemptCount: job.attempt_count
        });
        await recordAuditEvent({
          action: "import.staged",
          resourceType: "import_batch",
          resourceId: job.id,
          actorRole: "system",
          metadata: {
            filename,
            processedRows: summary.processedRows,
            attemptCount: job.attempt_count,
            consumer: "durable-cron-v2"
          }
        });
        continue;
      }

      result.completed += 1;
      result.jobs.push({
        importBatchId: job.id,
        status: "completed",
        attemptCount: job.attempt_count
      });
      await recordAuditEvent({
        action: "import.completed",
        resourceType: "import_batch",
        resourceId: job.id,
        actorRole: "system",
        metadata: {
          filename,
          processedRows: summary.processedRows,
          attemptCount: job.attempt_count,
          consumer: "durable-cron"
        }
      });
    } catch (error) {
      const message = errorMessage(error);
      const retryable = isRetryableImportError(error);
      const releaseResult = await supabase.rpc(
        job.pipeline_version === 2 ? "release_import_batch_claim_v2" : "release_import_batch_claim",
        {
          p_import_batch_id: job.id,
          p_lease_token: job.lease_token,
          p_error_message: message,
          p_retryable: retryable
        }
      );

      if (releaseResult.error) {
        throw new Error(
          `คืน lease งานนำเข้า ${job.id} ไม่สำเร็จ: ${releaseResult.error.message}; original error: ${message}`
        );
      }

      const release = (releaseResult.data || {}) as ReleaseResult;
      if (!release.released) {
        result.leaseLost += 1;
        result.jobs.push({
          importBatchId: job.id,
          status: "lease_lost",
          attemptCount: job.attempt_count,
          message
        });
        await recordAuditEvent({
          action: "import.lease_lost",
          resourceType: "import_batch",
          resourceId: job.id,
          actorRole: "system",
          outcome: "failure",
          metadata: { filename, attemptCount: job.attempt_count, message }
        });
        continue;
      }

      const status = release.status === "queued" ? "queued" : "failed";
      if (status === "queued") {
        result.retried += 1;
      } else {
        result.failed += 1;
        await deleteImportSourceIfTerminal({
          path: job.storage_path,
          importBatchId: job.id
        });
      }

      result.jobs.push({
        importBatchId: job.id,
        status,
        attemptCount: job.attempt_count,
        message
      });
      await recordAuditEvent({
        action: status === "queued" ? "import.retry_scheduled" : "import.failed",
        resourceType: "import_batch",
        resourceId: job.id,
        actorRole: "system",
        outcome: "failure",
        metadata: {
          filename,
          attemptCount: job.attempt_count,
          retryable,
          retryAfterSeconds: release.retryAfterSeconds ?? null,
          message
        }
      });
    }
  }

  return result;
}
