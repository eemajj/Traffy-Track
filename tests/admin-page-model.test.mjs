import assert from "node:assert/strict";
import test from "node:test";
import { formatAdminBytes, formatAdminImportStatus, getStoragePercent, getStorageTone } from "../lib/admin/page-model.ts";
test("admin page model preserves storage thresholds and import labels", () => {
  assert.equal(formatAdminBytes(1024), "1.00 KB");
  assert.equal(getStoragePercent(1024 * 1024 * 1024), 100);
  assert.equal(getStorageTone(85).label, "ใกล้เต็ม");
  assert.equal(formatAdminImportStatus("queued"), "รอประมวลผล");
});
