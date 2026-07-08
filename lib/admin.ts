import { unstable_noStore as noStore } from "next/cache";

import { hasSupabaseAdminEnv } from "@/lib/env";
import { archiveReportBatches } from "@/lib/report";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  IMPORT_BUCKET,
  REPORT_EVIDENCE_BUCKET,
  REPORT_EXPORT_BUCKET
} from "@/lib/storage";
import { createZipBuffer } from "@/lib/zip";

const ADMIN_TABLES = [
  "tickets",
  "ticket_history",
  "import_batches",
  "report_batches",
  "report_batch_departments",
  "report_batch_items",
  "report_archives"
] as const;

const BACKUP_TABLES = ADMIN_TABLES;
const BACKUP_BUCKETS = [REPORT_EVIDENCE_BUCKET] as const;
const BACKUP_CSV_TABLES = ["tickets", "ticket_history", "report_batch_items", "report_archives"] as const;
const PAGE_SIZE = 1000;

type AdminTableName = (typeof ADMIN_TABLES)[number];

type StorageObjectSummary = {
  bucket: string;
  path: string;
  size: number;
  updatedAt: string | null;
};

export type AdminOverviewData =
  | { status: "missing_env" }
  | { status: "unavailable"; message: string }
  | {
      status: "ready";
      generatedAt: string;
      database: {
        status: "ok" | "degraded";
        tables: Array<{
          table: AdminTableName;
          count: number;
          error: string | null;
        }>;
      };
      storage: {
        status: "ok" | "degraded";
        buckets: Array<{
          bucket: string;
          objectCount: number;
          totalBytes: number;
          error: string | null;
        }>;
      };
      limits: {
        database: string;
        storage: string;
        note: string;
      };
    };

function bytesToText(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows: Array<Record<string, unknown>>) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  if (headers.length === 0) {
    return "\uFEFF";
  }

  return `\uFEFF${[
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","))
  ].join("\n")}`;
}

async function fetchAllRows(table: AdminTableName) {
  const supabase = createSupabaseAdminClient();
  const rows: Array<Record<string, unknown>> = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const result = await supabase.from(table).select("*").range(from, to);

    if (result.error) {
      throw new Error(`โหลดข้อมูลตาราง ${table} ไม่สำเร็จ: ${result.error.message}`);
    }

    const pageRows = (result.data || []) as Array<Record<string, unknown>>;
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

async function listStorageObjects(bucket: string, prefix = ""): Promise<StorageObjectSummary[]> {
  const supabase = createSupabaseAdminClient();
  const objects: StorageObjectSummary[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await supabase.storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" }
    });

    if (result.error) {
      throw new Error(`อ่านรายการไฟล์ใน ${bucket} ไม่สำเร็จ: ${result.error.message}`);
    }

    const items = result.data || [];

    for (const item of items) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      const metadata = item.metadata as { size?: number } | null | undefined;

      if (metadata && typeof metadata.size === "number") {
        objects.push({
          bucket,
          path,
          size: metadata.size,
          updatedAt: item.updated_at || null
        });
      } else {
        objects.push(...(await listStorageObjects(bucket, path)));
      }
    }

    if (items.length < PAGE_SIZE) {
      break;
    }
  }

  return objects;
}

async function removeStoragePrefix(bucket: string, prefix = "") {
  const supabase = createSupabaseAdminClient();
  const objects = await listStorageObjects(bucket, prefix);
  const paths = objects.map((object) => object.path);

  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    const result = await supabase.storage.from(bucket).remove(chunk);

    if (result.error) {
      throw new Error(`ลบไฟล์ใน ${bucket} ไม่สำเร็จ: ${result.error.message}`);
    }
  }

  return {
    bucket,
    removedObjects: paths.length,
    removedBytes: objects.reduce((sum, object) => sum + object.size, 0)
  };
}

export async function getAdminOverview(): Promise<AdminOverviewData> {
  if (!hasSupabaseAdminEnv()) {
    return { status: "missing_env" };
  }

  try {
    noStore();

    const supabase = createSupabaseAdminClient();
    const [tableResults, storageResults] = await Promise.all([
      Promise.all(
        ADMIN_TABLES.map(async (table) => {
          const result = await supabase.from(table).select("*", { count: "exact", head: true });

          return {
            table,
            count: result.count || 0,
            error: result.error?.message || null
          };
        })
      ),
      Promise.all(
        [REPORT_EVIDENCE_BUCKET, REPORT_EXPORT_BUCKET, IMPORT_BUCKET].map(async (bucket) => {
          try {
            const objects = await listStorageObjects(bucket);

            return {
              bucket,
              objectCount: objects.length,
              totalBytes: objects.reduce((sum, object) => sum + object.size, 0),
              error: null
            };
          } catch (error) {
            return {
              bucket,
              objectCount: 0,
              totalBytes: 0,
              error: error instanceof Error ? error.message : "อ่านข้อมูล storage ไม่สำเร็จ"
            };
          }
        })
      )
    ]);

    return {
      status: "ready",
      generatedAt: new Date().toISOString(),
      database: {
        status: tableResults.some((table) => table.error) ? "degraded" : "ok",
        tables: tableResults
      },
      storage: {
        status: storageResults.some((bucket) => bucket.error) ? "degraded" : "ok",
        buckets: storageResults
      },
      limits: {
        database: "Supabase Free tier โดยทั่วไปให้ฐานข้อมูล 500 MB ต่อ project",
        storage: "Supabase Free tier โดยทั่วไปให้ Storage 1 GB",
        note: "ตัวเลขหน้า admin เป็นการนับ row และรวมขนาดไฟล์ใน bucket; ขนาดฐานข้อมูลจริงต้องใช้ Supabase dashboard หรือ management API"
      }
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "โหลดข้อมูล admin monitor ไม่สำเร็จ"
    };
  }
}

export async function createSystemBackupExport() {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("ระบบยังไม่ได้ตั้งค่า Supabase");
  }

  const supabase = createSupabaseAdminClient();
  const generatedAt = new Date();
  const tableEntries: Array<{ table: AdminTableName; rows: Array<Record<string, unknown>> }> = [];

  for (const table of BACKUP_TABLES) {
    tableEntries.push({
      table,
      rows: await fetchAllRows(table)
    });
  }

  const storageObjects = (await Promise.all(BACKUP_BUCKETS.map((bucket) => listStorageObjects(bucket)))).flat();
  const entries: Array<{ filename: string; data: Buffer<ArrayBufferLike> }> = [];
  const manifest = {
    generatedAt: generatedAt.toISOString(),
    tables: tableEntries.map((entry) => ({
      table: entry.table,
      rows: entry.rows.length
    })),
    storage: storageObjects.map((object) => ({
      bucket: object.bucket,
      path: object.path,
      size: object.size,
      updatedAt: object.updatedAt
    })),
    notes: [
      "Backup นี้รวมข้อมูลตารางหลักเป็น JSON และ CSV",
      `CSV ถูกสร้างเฉพาะตาราง ${BACKUP_CSV_TABLES.join(", ")} เพื่อลดขนาดไฟล์ backup`,
      "ไฟล์หลักฐานอยู่ในโฟลเดอร์ storage/report-evidence/",
      `ขนาดไฟล์หลักฐานรวม ${bytesToText(storageObjects.reduce((sum, object) => sum + object.size, 0))}`
    ]
  };

  entries.push({
    filename: "manifest.json",
    data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8")
  });

  for (const tableEntry of tableEntries) {
    entries.push({
      filename: `tables/${tableEntry.table}.json`,
      data: Buffer.from(JSON.stringify(tableEntry.rows, null, 2), "utf8")
    });

    if ((BACKUP_CSV_TABLES as readonly string[]).includes(tableEntry.table)) {
      entries.push({
        filename: `tables/${tableEntry.table}.csv`,
        data: Buffer.from(rowsToCsv(tableEntry.rows), "utf8")
      });
    }
  }

  for (const object of storageObjects) {
    const download = await supabase.storage.from(object.bucket).download(object.path);

    if (download.error || !download.data) {
      throw new Error(`ดาวน์โหลดไฟล์สำหรับ backup ไม่สำเร็จ: ${object.bucket}/${object.path}`);
    }

    entries.push({
      filename: `storage/${object.bucket}/${object.path}`,
      data: Buffer.from(await download.data.arrayBuffer())
    });
  }

  const zipBuffer = createZipBuffer(entries);
  const filename = `system-backup-${generatedAt.toISOString().replace(/[:.]/g, "-")}.zip`;
  return {
    filename,
    buffer: zipBuffer,
    tableRows: manifest.tables,
    storageObjects: storageObjects.length,
    sizeBytes: zipBuffer.length
  };
}

export async function previewSystemWipe(mode: "reports" | "all") {
  const overview = await getAdminOverview();

  if (overview.status !== "ready") {
    return overview;
  }

  const targetTables =
    mode === "reports"
      ? ["report_batches", "report_batch_departments", "report_batch_items"]
      : ADMIN_TABLES.filter((table) => table !== "report_archives");

  return {
    status: "ready" as const,
    mode,
    tables: overview.database.tables.filter((table) => targetTables.includes(table.table)),
    storage: overview.storage.buckets.filter((bucket) =>
      mode === "reports" ? bucket.bucket === REPORT_EVIDENCE_BUCKET : bucket.bucket !== REPORT_EXPORT_BUCKET
    )
  };
}

export async function wipeSystemData(input: { mode: "reports" | "all"; confirmation: string }) {
  if (!hasSupabaseAdminEnv()) {
    throw new Error("ระบบยังไม่ได้ตั้งค่า Supabase");
  }

  const requiredConfirmation = input.mode === "all" ? "WIPE ALL DATA" : "WIPE REPORT DATA";

  if (input.confirmation !== requiredConfirmation) {
    throw new Error(`กรุณาพิมพ์ ${requiredConfirmation} เพื่อยืนยัน`);
  }

  const supabase = createSupabaseAdminClient();
  const archiveResult = await archiveReportBatches({ markSourceDeleted: true });
  const deleteAllRows = async (table: AdminTableName, notNullColumn: string) => {
    const deleteResult = await supabase.from(table).delete().not(notNullColumn, "is", null);

    if (deleteResult.error) {
      throw new Error(`ล้างข้อมูลตาราง ${table} ไม่สำเร็จ: ${deleteResult.error.message}`);
    }
  };
  const storageResults =
    input.mode === "all"
      ? [await removeStoragePrefix(REPORT_EVIDENCE_BUCKET), await removeStoragePrefix(IMPORT_BUCKET)]
      : [await removeStoragePrefix(REPORT_EVIDENCE_BUCKET)];

  if (input.mode === "reports") {
    await deleteAllRows("report_batches", "id");
  } else {
    const orderedTables: Array<{ table: AdminTableName; notNullColumn: string }> = [
      { table: "report_batch_items", notNullColumn: "id" },
      { table: "report_batch_departments", notNullColumn: "id" },
      { table: "report_batches", notNullColumn: "id" },
      { table: "ticket_history", notNullColumn: "id" },
      { table: "import_batches", notNullColumn: "id" },
      { table: "tickets", notNullColumn: "ticket_id" }
    ];

    for (const target of orderedTables) {
      await deleteAllRows(target.table, target.notNullColumn);
    }
  }

  return {
    status: "ready" as const,
    mode: input.mode,
    archivedReports: archiveResult.archivedCount,
    storage: storageResults,
    completedAt: new Date().toISOString()
  };
}
