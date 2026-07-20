export function parseRestoreArguments(argv) {
  const options = { apply: false, allowUnverifiedArtifact: false, backupDirectory: "", artifactPath: "", artifactMetadataPath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--allow-unverified-artifact") options.allowUnverifiedArtifact = true;
    else if (argument === "--backup-dir") { options.backupDirectory = argv[index + 1] ?? ""; index += 1; }
    else if (argument === "--artifact") { options.artifactPath = argv[index + 1] ?? ""; index += 1; }
    else if (argument === "--artifact-manifest") { options.artifactMetadataPath = argv[index + 1] ?? ""; index += 1; }
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.backupDirectory) throw new Error("Usage: node scripts/restore-backup.mjs --backup-dir <extracted-directory> [--apply]");
  return options;
}

export function getSupabaseProjectRef(url) {
  const match = new URL(url).hostname.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (!match) throw new Error("SUPABASE_URL is not a canonical Supabase project URL");
  return match[1];
}

export function prepareRestoreRows(table, rows) {
  if (["ticket_history", "report_batch_items", "ticket_assignment_events", "report_workflow_events", "audit_events", "report_evidence_status_events"].includes(table)) {
    return rows.map(({ id: _id, ...row }) => row);
  }
  if (table === "report_batch_departments") return rows.map(({ current_evidence_version_id: _currentEvidenceVersionId, ...row }) => row);
  return rows;
}
