import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const PRODUCTION_PROJECT_REF = "zllbfazkhrvlfutehkyh";
const CHUNK_SIZE = 500;
const TABLES = [
  "tickets",
  "ticket_history",
  "import_batches",
  "report_batches",
  "report_batch_departments",
  "report_batch_items",
  "report_archives"
];
const DELETE_ORDER = [
  "report_batch_items",
  "report_batch_departments",
  "report_batches",
  "ticket_history",
  "import_batches",
  "tickets",
  "report_archives"
];
const INSERT_ORDER = [
  "tickets",
  "import_batches",
  "ticket_history",
  "report_batches",
  "report_batch_departments",
  "report_batch_items",
  "report_archives"
];
const PRIMARY_KEYS = {
  tickets: "ticket_id",
  ticket_history: "id",
  import_batches: "id",
  report_batches: "id",
  report_batch_departments: "id",
  report_batch_items: "id",
  report_archives: "id"
};

function parseArguments(argv) {
  const options = { apply: false, backupDirectory: "" };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") {
      options.apply = true;
    } else if (argument === "--backup-dir") {
      options.backupDirectory = argv[index + 1] ?? "";
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!options.backupDirectory) {
    throw new Error("Usage: node scripts/restore-backup.mjs --backup-dir <extracted-directory> [--apply]");
  }

  return options;
}

function getProjectRef(url) {
  const hostname = new URL(url).hostname;
  const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (!match) {
    throw new Error("SUPABASE_URL is not a canonical Supabase project URL");
  }
  return match[1];
}

async function readBackup(backupDirectory) {
  const manifest = JSON.parse(await readFile(path.join(backupDirectory, "manifest.json"), "utf8"));
  const rowsByTable = {};

  for (const table of TABLES) {
    const filename = path.join(backupDirectory, "tables", `${table}.json`);
    try {
      const rows = JSON.parse(await readFile(filename, "utf8"));
      if (!Array.isArray(rows)) {
        throw new Error(`${table}.json must contain a JSON array`);
      }
      rowsByTable[table] = rows;
    } catch (error) {
      if (error?.code === "ENOENT") {
        rowsByTable[table] = [];
      } else {
        throw error;
      }
    }
  }

  return { manifest, rowsByTable };
}

async function countRows(supabase, table) {
  const result = await supabase.from(table).select("*", { count: "exact", head: true });
  if (result.error) {
    throw new Error(`Could not count ${table}: ${result.error.message}`);
  }
  return result.count ?? 0;
}

async function deleteRows(supabase, table) {
  const result = await supabase.from(table).delete().not(PRIMARY_KEYS[table], "is", null);
  if (result.error) {
    throw new Error(`Could not clear ${table}: ${result.error.message}`);
  }
}

function prepareRows(table, rows) {
  if (table === "ticket_history" || table === "report_batch_items") {
    return rows.map(({ id: _id, ...row }) => row);
  }
  return rows;
}

async function insertRows(supabase, table, rows) {
  const preparedRows = prepareRows(table, rows);
  for (let offset = 0; offset < preparedRows.length; offset += CHUNK_SIZE) {
    const result = await supabase.from(table).insert(preparedRows.slice(offset, offset + CHUNK_SIZE));
    if (result.error) {
      throw new Error(`Could not restore ${table} at row ${offset}: ${result.error.message}`);
    }
  }
}

async function listStorageFiles(supabase, bucket, prefix = "") {
  const files = [];
  let offset = 0;

  while (true) {
    const result = await supabase.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" }
    });
    if (result.error) {
      throw new Error(`Could not list storage ${bucket}/${prefix}: ${result.error.message}`);
    }

    for (const entry of result.data) {
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        files.push(entryPath);
      } else {
        files.push(...(await listStorageFiles(supabase, bucket, entryPath)));
      }
    }

    if (result.data.length < 1000) {
      break;
    }
    offset += result.data.length;
  }

  return files;
}

async function restoreStorage(supabase, backupDirectory, manifest) {
  const buckets = [...new Set((manifest.storage ?? []).map((object) => object.bucket))];
  if (!buckets.includes("report-evidence")) {
    buckets.push("report-evidence");
  }

  for (const bucket of buckets) {
    const existingFiles = await listStorageFiles(supabase, bucket);
    for (let offset = 0; offset < existingFiles.length; offset += 100) {
      const result = await supabase.storage.from(bucket).remove(existingFiles.slice(offset, offset + 100));
      if (result.error) {
        throw new Error(`Could not clear storage bucket ${bucket}: ${result.error.message}`);
      }
    }
  }

  for (const object of manifest.storage ?? []) {
    const data = await readFile(path.join(backupDirectory, "storage", object.bucket, object.path));
    const result = await supabase.storage.from(object.bucket).upload(object.path, data, { upsert: true });
    if (result.error) {
      throw new Error(`Could not restore storage ${object.bucket}/${object.path}: ${result.error.message}`);
    }
  }
}

const options = parseArguments(process.argv.slice(2));
const supabaseUrl = process.env.SUPABASE_URL;
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const confirmation = process.env.RESTORE_CONFIRM_PROJECT_REF;

if (!serviceRoleKey && process.env.SUPABASE_API_KEYS_FILE) {
  const apiKeys = JSON.parse(await readFile(process.env.SUPABASE_API_KEYS_FILE, "utf8"));
  serviceRoleKey = apiKeys.find((key) => key.id === "service_role")?.api_key;
}

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const projectRef = getProjectRef(supabaseUrl);
if (projectRef === PRODUCTION_PROJECT_REF) {
  throw new Error(`Refusing to restore the production project ${projectRef}`);
}
if (confirmation !== projectRef) {
  throw new Error(`Set RESTORE_CONFIRM_PROJECT_REF=${projectRef} to confirm the target project`);
}

const backupDirectory = path.resolve(options.backupDirectory);
const { manifest, rowsByTable } = await readBackup(backupDirectory);
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const beforeCounts = Object.fromEntries(
  await Promise.all(TABLES.map(async (table) => [table, await countRows(supabase, table)]))
);

console.log(JSON.stringify({
  mode: options.apply ? "apply" : "dry-run",
  targetProjectRef: projectRef,
  backupGeneratedAt: manifest.generatedAt,
  beforeCounts,
  restoreCounts: Object.fromEntries(TABLES.map((table) => [table, rowsByTable[table].length])),
  storageObjects: manifest.storage?.length ?? 0
}, null, 2));

if (!options.apply) {
  console.log("Dry run complete. Re-run with --apply to restore this backup.");
  process.exit(0);
}

for (const table of DELETE_ORDER) {
  await deleteRows(supabase, table);
}
for (const table of INSERT_ORDER) {
  await insertRows(supabase, table, rowsByTable[table]);
}
await restoreStorage(supabase, backupDirectory, manifest);

const afterCounts = Object.fromEntries(
  await Promise.all(TABLES.map(async (table) => [table, await countRows(supabase, table)]))
);
for (const table of TABLES) {
  if (afterCounts[table] !== rowsByTable[table].length) {
    throw new Error(`Verification failed for ${table}: expected ${rowsByTable[table].length}, got ${afterCounts[table]}`);
  }
}

console.log(JSON.stringify({ status: "restored", targetProjectRef: projectRef, afterCounts }, null, 2));
