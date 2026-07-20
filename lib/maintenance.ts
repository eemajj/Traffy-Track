import type { SupabaseClient } from "@supabase/supabase-js";

import {
  GENERATED_EXPORT_RETENTION_MS,
  isStorageObjectPastRetention,
  TEMP_IMPORT_RETENTION_MS
} from "@/lib/maintenance-policy";
import {
  ensurePrivateBucket,
  IMPORT_ALLOWED_TYPES,
  IMPORT_BUCKET,
  IMPORT_MAX_BYTES,
  REPORT_EXPORT_BUCKET,
  REPORT_EXPORT_MAX_BYTES
} from "@/lib/storage";

const STORAGE_PAGE_SIZE = 100;
const STORAGE_REMOVE_BATCH_SIZE = 100;

type StorageClient = SupabaseClient;

type ExpiredStorageObject = {
  path: string;
  size: number;
};

export type StorageCleanupSummary = {
  bucket: string;
  prefix: string;
  retentionDays: number;
  removedObjects: number;
  removedBytes: number;
};

type StorageDeletionJob = {
  id: string;
  bucket: string;
  object_path: string;
  lease_token: string;
  attempts: number;
};

export type StorageDeletionOutboxSummary = {
  expiredUploadIntents: number;
  claimed: number;
  removed: number;
  skippedReferenced: number;
  failed: number;
};

export type OperationsHealthSnapshot = {
  outbox: {
    pending: number;
    processing: number;
    failed: number;
    dead: number;
    staleLeases: number;
    oldestActionableAt: string | null;
    oldestDeadAt: string | null;
    maxAttempts: number;
  };
  imports: {
    active: number;
    failed: number;
    staleActive: number;
    staleQueued: number;
    staleRunning: number;
    oldestActiveAt: string | null;
    oldestHeartbeatAt: string | null;
  };
};

export type StaleImportRecoverySummary = {
  recovered: number;
  importBatchIds: string[];
};

export type StorageDeletionRetrySummary = {
  retried: number;
  jobIds: string[];
};

export async function getOperationsHealth(
  supabase: StorageClient
): Promise<OperationsHealthSnapshot> {
  const result = await supabase.rpc("operations_health_snapshot");
  if (result.error || !result.data) {
    throw new Error(`โหลดสถานะคิวงานเบื้องหลังไม่สำเร็จ: ${result.error?.message || "ไม่พบข้อมูล"}`);
  }
  return result.data as OperationsHealthSnapshot;
}

export async function recoverStaleImportJobs(
  supabase: StorageClient
): Promise<StaleImportRecoverySummary> {
  const result = await supabase.rpc("recover_stale_import_jobs");
  if (result.error || !result.data) {
    throw new Error(`กู้สถานะงานนำเข้าที่ค้างไม่สำเร็จ: ${result.error?.message || "ไม่พบข้อมูล"}`);
  }
  return result.data as StaleImportRecoverySummary;
}

export async function retryFailedStorageDeletionJobs(
  supabase: StorageClient
): Promise<StorageDeletionRetrySummary> {
  const failedJobs = await supabase
    .from("storage_deletion_outbox")
    .select("id")
    .in("status", ["failed", "dead"])
    .order("requested_at", { ascending: true })
    .limit(500);

  if (failedJobs.error) {
    throw new Error(`โหลดงานลบไฟล์ที่ต้อง retry ไม่สำเร็จ: ${failedJobs.error.message}`);
  }

  const jobIds = (failedJobs.data || []).map((job) => String(job.id));
  if (jobIds.length === 0) {
    return { retried: 0, jobIds: [] };
  }

  const retryResult = await supabase
    .from("storage_deletion_outbox")
    .update({
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      lease_token: null,
      locked_until: null,
      last_error: null,
      completed_at: null,
      updated_at: new Date().toISOString()
    })
    .in("id", jobIds)
    .in("status", ["failed", "dead"])
    .select("id");

  if (retryResult.error) {
    throw new Error(`นำงานลบไฟล์กลับเข้าคิวไม่สำเร็จ: ${retryResult.error.message}`);
  }

  const retriedIds = (retryResult.data || []).map((job) => String(job.id));
  return { retried: retriedIds.length, jobIds: retriedIds };
}

async function listExpiredStorageObjects(
  supabase: StorageClient,
  input: {
    bucket: string;
    prefix: string;
    cutoffMs: number;
  }
): Promise<ExpiredStorageObject[]> {
  const expiredObjects: ExpiredStorageObject[] = [];

  for (let offset = 0; ; offset += STORAGE_PAGE_SIZE) {
    const result = await supabase.storage.from(input.bucket).list(input.prefix, {
      limit: STORAGE_PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" }
    });

    if (result.error) {
      throw new Error(`อ่านรายการไฟล์ชั่วคราวใน ${input.bucket} ไม่สำเร็จ: ${result.error.message}`);
    }

    const items = result.data || [];

    for (const item of items) {
      const path = input.prefix ? `${input.prefix}/${item.name}` : item.name;

      if (item.id === null) {
        expiredObjects.push(
          ...(await listExpiredStorageObjects(supabase, {
            ...input,
            prefix: path
          }))
        );
        continue;
      }

      if (
        isStorageObjectPastRetention(
          {
            createdAt: item.created_at,
            updatedAt: item.updated_at
          },
          input.cutoffMs
        )
      ) {
        expiredObjects.push({
          path,
          size: typeof item.metadata?.size === "number" ? item.metadata.size : 0
        });
      }
    }

    if (items.length < STORAGE_PAGE_SIZE) {
      break;
    }
  }

  return expiredObjects;
}

async function cleanupBucket(
  supabase: StorageClient,
  input: {
    bucket: string;
    prefix: string;
    retentionMs: number;
    nowMs: number;
  }
): Promise<StorageCleanupSummary> {
  const expiredObjects = await listExpiredStorageObjects(supabase, {
    bucket: input.bucket,
    prefix: input.prefix,
    cutoffMs: input.nowMs - input.retentionMs
  });

  for (let index = 0; index < expiredObjects.length; index += STORAGE_REMOVE_BATCH_SIZE) {
    const paths = expiredObjects
      .slice(index, index + STORAGE_REMOVE_BATCH_SIZE)
      .map((object) => object.path);
    const result = await supabase.storage.from(input.bucket).remove(paths);

    if (result.error) {
      throw new Error(`ลบไฟล์ชั่วคราวใน ${input.bucket} ไม่สำเร็จ: ${result.error.message}`);
    }
  }

  return {
    bucket: input.bucket,
    prefix: input.prefix,
    retentionDays: input.retentionMs / (24 * 60 * 60 * 1000),
    removedObjects: expiredObjects.length,
    removedBytes: expiredObjects.reduce((total, object) => total + object.size, 0)
  };
}

export async function cleanupTemporaryStorage(supabase: StorageClient, now = new Date()) {
  await Promise.all([
    ensurePrivateBucket(supabase, IMPORT_BUCKET, {
      fileSizeLimit: IMPORT_MAX_BYTES,
      allowedMimeTypes: [...IMPORT_ALLOWED_TYPES].filter(Boolean)
    }),
    ensurePrivateBucket(supabase, REPORT_EXPORT_BUCKET, {
      fileSizeLimit: REPORT_EXPORT_MAX_BYTES
    })
  ]);

  const nowMs = now.getTime();

  return Promise.all([
    cleanupBucket(supabase, {
      bucket: IMPORT_BUCKET,
      prefix: "incoming",
      retentionMs: TEMP_IMPORT_RETENTION_MS,
      nowMs
    }),
    cleanupBucket(supabase, {
      bucket: REPORT_EXPORT_BUCKET,
      prefix: "",
      retentionMs: GENERATED_EXPORT_RETENTION_MS,
      nowMs
    })
  ]);
}

export async function reconcileStorageDeletionOutbox(
  supabase: StorageClient
): Promise<StorageDeletionOutboxSummary> {
  const expireResult = await supabase.rpc("expire_evidence_upload_intents");
  if (expireResult.error) {
    throw new Error(`ปิด upload intent ที่หมดอายุไม่สำเร็จ: ${expireResult.error.message}`);
  }

  const claimResult = await supabase.rpc("claim_storage_deletions", { p_limit: 100 });
  if (claimResult.error) {
    throw new Error(`รับงานลบไฟล์จาก outbox ไม่สำเร็จ: ${claimResult.error.message}`);
  }

  const jobs = (claimResult.data as StorageDeletionJob[] | null) || [];
  let removed = 0;
  let skippedReferenced = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const referenceResult = await supabase.rpc("is_storage_object_referenced", {
        p_bucket: job.bucket,
        p_object_path: job.object_path
      });
      if (referenceResult.error) throw referenceResult.error;

      if (referenceResult.data === true) {
        skippedReferenced += 1;
      } else {
        const removeResult = await supabase.storage.from(job.bucket).remove([job.object_path]);
        if (removeResult.error) throw removeResult.error;
        removed += 1;
      }

      const completeResult = await supabase.rpc("complete_storage_deletion", {
        p_id: job.id,
        p_lease_token: job.lease_token
      });
      if (completeResult.error || completeResult.data !== true) {
        throw completeResult.error || new Error("storage deletion lease หมดอายุก่อนบันทึกผลสำเร็จ");
      }
    } catch (error) {
      failed += 1;
      const failResult = await supabase.rpc("fail_storage_deletion", {
        p_id: job.id,
        p_lease_token: job.lease_token,
        p_error: error instanceof Error ? error.message : "unknown storage deletion error"
      });
      if (failResult.error) {
        console.error("Failed to reschedule storage deletion", {
          jobId: job.id,
          message: failResult.error.message
        });
      }
    }
  }

  return {
    expiredUploadIntents: Number(expireResult.data || 0),
    claimed: jobs.length,
    removed,
    skippedReferenced,
    failed
  };
}
