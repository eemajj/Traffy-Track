import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import {
  IMPORT_MAX_BYTES,
  REPORT_EXPORT_MAX_BYTES,
  STORAGE_FREE_TIER_MAX_BYTES
} from "@/lib/maintenance-policy";
import { createSupabaseAdminClient } from "@/lib/supabase";

export { IMPORT_MAX_BYTES, REPORT_EXPORT_MAX_BYTES, STORAGE_FREE_TIER_MAX_BYTES };

export const IMPORT_BUCKET = "traffy-track-imports";
export const REPORT_EVIDENCE_BUCKET = "report-evidence";
export const REPORT_EXPORT_BUCKET = "traffy-track-exports";

export const IMPORT_ALLOWED_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
  ""
]);

export const REPORT_EXPORT_SIGNED_URL_SECONDS = 10 * 60;

type StorageClient = SupabaseClient;

export function sanitizeStorageSegment(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80)
    .toLowerCase();
}

export function getBrowserStorageConfig() {
  return {
    supabaseUrl: env.supabaseUrl,
    anonKey: env.supabaseAnonKey
  };
}

export async function ensurePrivateBucket(
  supabase: StorageClient,
  bucket: string,
  options?: {
    fileSizeLimit?: number;
    allowedMimeTypes?: string[];
  }
) {
  const bucketOptions = {
    public: false,
    fileSizeLimit: options?.fileSizeLimit,
    allowedMimeTypes: options?.allowedMimeTypes
  };
  const existingBucket = await supabase.storage.getBucket(bucket);

  if (!existingBucket.error) {
    const updateResult = await supabase.storage.updateBucket(bucket, bucketOptions);

    if (updateResult.error) {
      throw new Error(`อัปเดตพื้นที่เก็บไฟล์ ${bucket} ไม่สำเร็จ: ${updateResult.error.message}`);
    }

    return;
  }

  const createResult = await supabase.storage.createBucket(bucket, bucketOptions);

  if (createResult.error && !/already exists/i.test(createResult.error.message)) {
    throw new Error(`เตรียมพื้นที่เก็บไฟล์ ${bucket} ไม่สำเร็จ: ${createResult.error.message}`);
  }

  if (createResult.error) {
    const updateResult = await supabase.storage.updateBucket(bucket, bucketOptions);

    if (updateResult.error) {
      throw new Error(`อัปเดตพื้นที่เก็บไฟล์ ${bucket} ไม่สำเร็จ: ${updateResult.error.message}`);
    }
  }
}

export async function createSignedUploadTarget(input: {
  bucket: string;
  path: string;
  fileSizeLimit?: number;
  allowedMimeTypes?: string[];
}) {
  const supabase = createSupabaseAdminClient();

  await ensurePrivateBucket(supabase, input.bucket, {
    fileSizeLimit: input.fileSizeLimit,
    allowedMimeTypes: input.allowedMimeTypes
  });

  const result = await supabase.storage.from(input.bucket).createSignedUploadUrl(input.path);

  if (result.error || !result.data) {
    throw new Error(`สร้างสิทธิ์อัปโหลดไฟล์ไม่สำเร็จ: ${result.error?.message || "ไม่ทราบสาเหตุ"}`);
  }

  const browserConfig = getBrowserStorageConfig();

  return {
    bucket: input.bucket,
    path: input.path,
    token: result.data.token,
    signedUrl: result.data.signedUrl,
    supabaseUrl: browserConfig.supabaseUrl,
    anonKey: browserConfig.anonKey
  };
}

export async function uploadBufferAndCreateSignedDownload(input: {
  bucket: string;
  path: string;
  buffer: Buffer | Uint8Array;
  contentType: string;
  filename: string;
  expiresIn?: number;
  fileSizeLimit?: number;
}) {
  const supabase = createSupabaseAdminClient();

  await ensurePrivateBucket(supabase, input.bucket, {
    fileSizeLimit: input.fileSizeLimit
  });

  const uploadResult = await supabase.storage.from(input.bucket).upload(input.path, input.buffer, {
    contentType: input.contentType,
    upsert: true
  });

  if (uploadResult.error) {
    throw new Error(`จัดเก็บไฟล์ส่งออกไม่สำเร็จ: ${uploadResult.error.message}`);
  }

  const signedUrlResult = await supabase.storage
    .from(input.bucket)
    .createSignedUrl(input.path, input.expiresIn || REPORT_EXPORT_SIGNED_URL_SECONDS, {
      download: input.filename
    });

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    throw new Error(`สร้างลิงก์ดาวน์โหลดไฟล์ไม่สำเร็จ: ${signedUrlResult.error?.message || "ไม่ทราบสาเหตุ"}`);
  }

  return signedUrlResult.data.signedUrl;
}
