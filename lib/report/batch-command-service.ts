import { hasSupabaseAdminEnv } from "@/lib/env";
import {
  createReportBatchCommandService,
  type BatchCommandDependencies,
  type BatchCommandResult
} from "@/lib/report/batch-command-core";
import { createSupabaseAdminClient } from "@/lib/supabase";

function normalizeResult<T>(result: {
  data: unknown;
  error: { message: string } | null;
}): BatchCommandResult<T> {
  return { data: result.data as T | null, error: result.error ? { message: result.error.message } : null };
}

function createRuntimeDependencies(): BatchCommandDependencies {
  let client: ReturnType<typeof createSupabaseAdminClient> | null = null;
  const getClient = () => {
    client ||= createSupabaseAdminClient();
    return client;
  };

  return {
    hasAdminEnv: hasSupabaseAdminEnv,
    async createSnapshot(input) {
      return normalizeResult<unknown>(await getClient().rpc("create_report_batch_snapshot", {
        p_report_date: input.reportDate,
        p_note: input.note,
        p_idempotency_key: input.idempotencyKey
      }));
    },
    async updateBatch(input) {
      return normalizeResult<{ id: string }>(await getClient()
        .from("report_batches")
        .update({ report_date: input.reportDate, note: input.note })
        .eq("id", input.batchId)
        .select("id")
        .maybeSingle());
    },
    async deleteBatch(batchId) {
      return normalizeResult<unknown>(await getClient().from("report_batches").delete().eq("id", batchId));
    }
  };
}

const batchCommandService = createReportBatchCommandService(createRuntimeDependencies());

export function createReportBatch(input: { reportDate: string; note: string | null; idempotencyKey: string }) {
  return batchCommandService.create(input);
}

export function updateReportBatch(input: { batchId: string; reportDate: string; note: string | null }) {
  return batchCommandService.update(input);
}

export function deleteReportBatch(batchId: string) {
  return batchCommandService.delete(batchId);
}
