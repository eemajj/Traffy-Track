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
