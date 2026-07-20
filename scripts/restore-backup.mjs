import { readFile } from "node:fs/promises";
import { createDecipheriv, createHash, scrypt as scryptCallback } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseProjectRef as getProjectRef, parseRestoreArguments as parseArguments, prepareRestoreRows as prepareRows } from "./lib/restore-plan.mjs";

const PRODUCTION_PROJECT_REF = "zllbfazkhrvlfutehkyh";
const CHUNK_SIZE = 500;
const scrypt = promisify(scryptCallback);
const TABLES = [
  "tickets",
  "ticket_history",
  "import_batches",
  "report_batches",
  "report_batch_departments",
  "report_batch_items",
  "ticket_assignment_events",
  "report_workflow_events",
  "audit_events",
  "report_evidence_versions",
  "report_evidence_status_events",
  "report_archives",
  "passcode_profiles"
];
const DELETE_ORDER = [
  "passcode_profiles",
  "audit_events",
  "ticket_assignment_events",
  "report_workflow_events",
  "report_batch_items",
  "report_batch_departments",
  "report_batches",
  "ticket_history",
  "import_batches",
  "tickets",
  "report_archives"
];
const INSERT_ORDER = [
  "passcode_profiles",
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
  ticket_assignment_events: "id",
  report_workflow_events: "id",
  audit_events: "id",
  report_evidence_versions: "id",
  report_evidence_status_events: "id",
  report_archives: "id",
  passcode_profiles: "id"
};

async function decryptArtifact(data, passphrase) {
  const magic = data.subarray(0, 9).toString("ascii");
  if (magic !== "TFBACKUP1" || data.length < 13) {
    throw new Error("Encrypted backup artifact has an invalid format");
  }
  const headerLength = data.readUInt32BE(9);
  const headerEnd = 13 + headerLength;
  if (headerLength < 2 || headerEnd > data.length) {
    throw new Error("Encrypted backup artifact header is invalid");
  }
  const header = JSON.parse(data.subarray(13, headerEnd).toString("utf8"));
  if (header.format !== "tf-backup-encrypted-v1" || header.cipher !== "aes-256-gcm" || header.kdf !== "scrypt") {
    throw new Error("Encrypted backup artifact uses an unsupported format");
  }
  const key = await scrypt(passphrase, Buffer.from(header.salt, "base64"), 32);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(header.iv, "base64"));
  decipher.setAuthTag(Buffer.from(header.tag, "base64"));
  return Buffer.concat([decipher.update(data.subarray(headerEnd)), decipher.final()]);
}

async function verifyArtifact(options) {
  if (!options.artifactPath && !options.artifactMetadataPath) return null;
  if (!options.artifactPath || !options.artifactMetadataPath) {
    throw new Error("--artifact and --artifact-manifest must be supplied together");
  }

  const [artifact, metadataText] = await Promise.all([
    readFile(path.resolve(options.artifactPath)),
    readFile(path.resolve(options.artifactMetadataPath), "utf8")
  ]);
  const metadata = JSON.parse(metadataText);
  const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
  if (metadata.format !== "tf-backup-artifact-v1" || metadata.artifactSha256 !== artifactSha256) {
    throw new Error("Backup artifact checksum does not match its manifest");
  }

  let plaintext = artifact;
  if (metadata.encrypted) {
    const passphrase = process.env.BACKUP_ENCRYPTION_PASSPHRASE || "";
    if (!passphrase) {
      throw new Error("BACKUP_ENCRYPTION_PASSPHRASE is required to authenticate the encrypted artifact");
    }
    plaintext = await decryptArtifact(artifact, passphrase);
  }
  const plaintextSha256 = createHash("sha256").update(plaintext).digest("hex");
  if (metadata.plaintextSha256 !== plaintextSha256) {
    throw new Error("Backup plaintext checksum does not match its manifest");
  }

  return {
    backupId: metadata.backupId || null,
    artifactSha256,
    plaintextSha256,
    encrypted: metadata.encrypted === true,
    retainUntil: metadata.retainUntil || null
  };
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

async function insertRows(supabase, table, rows) {
  const preparedRows = prepareRows(table, rows);
  for (let offset = 0; offset < preparedRows.length; offset += CHUNK_SIZE) {
    const result = await supabase.from(table).insert(preparedRows.slice(offset, offset + CHUNK_SIZE));
    if (result.error) {
      throw new Error(`Could not restore ${table} at row ${offset}: ${result.error.message}`);
    }
  }
}

async function restoreImmutableEvidence(supabase, rowsByTable) {
  const result = await supabase.rpc("restore_report_evidence_snapshot", {
    p_versions: rowsByTable.report_evidence_versions,
    p_events: rowsByTable.report_evidence_status_events
  });

  if (result.error) {
    throw new Error(`Could not restore immutable evidence history: ${result.error.message}`);
  }

  const restoredVersions = Number(result.data?.versions ?? -1);
  const restoredEvents = Number(result.data?.events ?? -1);
  if (
    restoredVersions !== rowsByTable.report_evidence_versions.length
    || restoredEvents !== rowsByTable.report_evidence_status_events.length
  ) {
    throw new Error(
      `Evidence restore count mismatch: expected ${rowsByTable.report_evidence_versions.length}/${rowsByTable.report_evidence_status_events.length}, got ${restoredVersions}/${restoredEvents}`
    );
  }
}

async function restoreOperationalHistory(supabase, rowsByTable) {
  const result = await supabase.rpc("restore_operational_history_snapshot", {
    p_assignments: rowsByTable.ticket_assignment_events,
    p_workflow: rowsByTable.report_workflow_events,
    p_audit: rowsByTable.audit_events
  });

  if (result.error) {
    throw new Error(`Could not restore operational history: ${result.error.message}`);
  }

  const expected = {
    assignments: rowsByTable.ticket_assignment_events.length,
    workflow: rowsByTable.report_workflow_events.length,
    audit: rowsByTable.audit_events.length
  };
  for (const [key, count] of Object.entries(expected)) {
    if (Number(result.data?.[key] ?? -1) !== count) {
      throw new Error(`Operational history restore count mismatch for ${key}: expected ${count}, got ${result.data?.[key]}`);
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

async function verifyStorage(supabase, backupDirectory, manifest) {
  for (const object of manifest.storage ?? []) {
    const [expected, downloaded] = await Promise.all([
      readFile(path.join(backupDirectory, "storage", object.bucket, object.path)),
      supabase.storage.from(object.bucket).download(object.path)
    ]);
    if (downloaded.error || !downloaded.data) {
      throw new Error(`Could not verify restored storage ${object.bucket}/${object.path}`);
    }

    const actual = Buffer.from(await downloaded.data.arrayBuffer());
    const expectedHash = createHash("sha256").update(expected).digest("hex");
    const actualHash = createHash("sha256").update(actual).digest("hex");
    if (expected.length !== actual.length || expectedHash !== actualHash) {
      throw new Error(`Storage verification failed for ${object.bucket}/${object.path}`);
    }
  }
}

async function recordRestoreAudit(supabase, input) {
  const result = await supabase.from("audit_events").insert({
    actor_role: "system",
    action: input.action,
    resource_type: "backup_artifact",
    resource_id: input.backupId || null,
    outcome: input.outcome || "success",
    metadata: input.metadata || {}
  });
  if (result.error) {
    console.error(`Restore audit write failed: ${result.error.message}`);
  }
}

const options = parseArguments(process.argv.slice(2));
const verifiedArtifact = await verifyArtifact(options);
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
  storageObjects: manifest.storage?.length ?? 0,
  verifiedArtifact
}, null, 2));

if (!options.apply) {
  await recordRestoreAudit(supabase, {
    action: "backup.restore_previewed",
    backupId: verifiedArtifact?.backupId,
    metadata: { targetProjectRef: projectRef, verifiedArtifact }
  });
  console.log("Dry run complete. Re-run with --apply to restore this backup.");
  process.exit(0);
}

if (!verifiedArtifact && !options.allowUnverifiedArtifact) {
  throw new Error(
    "Refusing an unverified restore. Supply --artifact and --artifact-manifest, or explicitly use --allow-unverified-artifact."
  );
}

const backedUpTables = new Set(
  Array.isArray(manifest.tables) ? manifest.tables.map((entry) => entry?.table).filter(Boolean) : []
);

try {
  for (const table of DELETE_ORDER) {
    if (table === "passcode_profiles" && !backedUpTables.has(table)) continue;
    await deleteRows(supabase, table);
  }
  for (const table of INSERT_ORDER) {
    if (table === "passcode_profiles" && !backedUpTables.has(table)) continue;
    await insertRows(supabase, table, rowsByTable[table]);
  }
  const hasOperationalHistory = [
    "ticket_assignment_events",
    "report_workflow_events",
    "audit_events"
  ].some((table) => backedUpTables.has(table));
  if (hasOperationalHistory) {
    // Report inserts emit workflow/audit rows. Clear those and restore all
    // backed-up append-only streams atomically with their original IDs.
    await deleteRows(supabase, "ticket_assignment_events");
    await deleteRows(supabase, "report_workflow_events");
    await deleteRows(supabase, "audit_events");
    await restoreOperationalHistory(supabase, rowsByTable);
  }
  await restoreImmutableEvidence(supabase, rowsByTable);
  for (const department of rowsByTable.report_batch_departments) {
    if (!department.current_evidence_version_id) continue;
    const result = await supabase
      .from("report_batch_departments")
      .update({ current_evidence_version_id: department.current_evidence_version_id })
      .eq("id", department.id);
    if (result.error) {
      throw new Error(`Could not restore evidence pointer for department ${department.id}: ${result.error.message}`);
    }
  }
  await restoreStorage(supabase, backupDirectory, manifest);
  await verifyStorage(supabase, backupDirectory, manifest);

  const afterCounts = Object.fromEntries(
    await Promise.all(TABLES.map(async (table) => [table, await countRows(supabase, table)]))
  );
  for (const table of TABLES) {
    if (
      (
        table === "ticket_assignment_events"
        || table === "report_workflow_events"
        || table === "audit_events"
        || table === "passcode_profiles"
      )
      && !backedUpTables.has(table)
    ) {
      continue;
    }
    if (afterCounts[table] !== rowsByTable[table].length) {
      throw new Error(`Verification failed for ${table}: expected ${rowsByTable[table].length}, got ${afterCounts[table]}`);
    }
  }

  await recordRestoreAudit(supabase, {
    action: "backup.restored",
    backupId: verifiedArtifact?.backupId,
    metadata: { targetProjectRef: projectRef, afterCounts, verifiedArtifact }
  });
  console.log(JSON.stringify({ status: "restored", targetProjectRef: projectRef, afterCounts }, null, 2));
} catch (error) {
  await recordRestoreAudit(supabase, {
    action: "backup.restore_failed",
    backupId: verifiedArtifact?.backupId,
    outcome: "failure",
    metadata: {
      targetProjectRef: projectRef,
      verifiedArtifact,
      message: error instanceof Error ? error.message : "unknown error"
    }
  });
  throw error;
}
