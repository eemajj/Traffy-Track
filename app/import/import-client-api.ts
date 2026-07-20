import { createClient } from "@supabase/supabase-js";
import type { ImportPreview, ImportUploadTarget } from "@/lib/import/client-model";

export async function requestImportUploadTarget(file: File) {
  const response = await fetch("/api/import/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type || "text/csv", size: file.size })
  });
  const payload = (await response.json()) as ImportUploadTarget & { error?: string };
  if (!response.ok) throw new Error(payload.error || "เตรียมสิทธิ์อัปโหลดไฟล์ไม่สำเร็จ");
  return payload;
}

export async function uploadImportFile(file: File, target: ImportUploadTarget) {
  const result = await createClient(target.supabaseUrl, target.anonKey).storage
    .from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, file, { contentType: file.type || "text/csv" });
  if (result.error) throw new Error(`อัปโหลดไฟล์ไปพื้นที่เก็บไฟล์ไม่สำเร็จ: ${result.error.message}`);
}

export async function requestImportPreview(file: File, target: ImportUploadTarget) {
  const response = await fetch("/api/import/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: target.path, filename: file.name, size: file.size })
  });
  const payload = (await response.json()) as ImportPreview & { error?: string };
  if (!response.ok) throw new Error(payload.error || "ตรวจไฟล์นำเข้าไม่สำเร็จ");
  return payload;
}
