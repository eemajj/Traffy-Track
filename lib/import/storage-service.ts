import { createSupabaseAdminClient } from "@/lib/supabase";
import { IMPORT_BUCKET } from "@/lib/storage";

export async function downloadImportSource(path: string) {
  const result = await createSupabaseAdminClient().storage.from(IMPORT_BUCKET).download(path);
  if (result.error || !result.data) {
    throw new Error(`โหลดไฟล์นำเข้าจากพื้นที่เก็บไฟล์ไม่สำเร็จ: ${result.error?.message || "ไม่พบไฟล์"}`);
  }
  return result.data.text();
}

export async function deleteImportSourceIfTerminal(input: { path: string; importBatchId: string }) {
  const supabase = createSupabaseAdminClient();
  const statusResult = await supabase.from("import_batches").select("status").eq("id", input.importBatchId).maybeSingle();
  if (!statusResult.error && (statusResult.data?.status === "completed" || statusResult.data?.status === "failed")) {
    const removeResult = await supabase.storage.from(IMPORT_BUCKET).remove([input.path]);
    if (removeResult.error) {
      console.error("Import source cleanup failed", { importBatchId: input.importBatchId, path: input.path, message: removeResult.error.message });
    }
  }
}

export async function removeImportSourceWhenTerminal(input: { path: string; importBatchId: string }) {
  const supabase = createSupabaseAdminClient();
  const statusResult = await supabase.from("import_batches").select("status").eq("id", input.importBatchId).maybeSingle();
  if (!statusResult.error && (statusResult.data?.status === "completed" || statusResult.data?.status === "failed")) {
    await supabase.storage.from(IMPORT_BUCKET).remove([input.path]);
  }
}
