import { createSystemBackupExport as createRuntimeSystemBackupExport } from "@/lib/admin/runtime";

export async function createSystemBackupExport() {
  return createRuntimeSystemBackupExport();
}
