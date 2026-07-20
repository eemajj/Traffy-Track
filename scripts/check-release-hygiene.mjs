import { readdir, readFile } from "node:fs/promises";
import process from "node:process";

const migrationDirectory = new URL("../supabase/migrations/", import.meta.url);
const validMigrationName = /^\d{14}_[a-z0-9_]+\.sql$/;
const ignoredSidecarName = /^(?:\._|\.DS_Store$)/;

const entries = await readdir(migrationDirectory, { withFileTypes: true });
const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
const sidecars = files.filter((name) => ignoredSidecarName.test(name));
const invalidSqlNames = files.filter((name) => (
  name.endsWith(".sql") && !ignoredSidecarName.test(name) && !validMigrationName.test(name)
));

const requiredGitIgnores = ["._*", "**/._*", ".npm/", ".supabase/", "output/", "tmp/", "summarizereport/"];
const requiredVercelIgnores = ["._*", "**/._*", ".npm/", ".supabase/", "output/", "tmp/", "summarizereport/"];
const [gitignore, vercelignore] = await Promise.all([
  readFile(new URL("../.gitignore", import.meta.url), "utf8"),
  readFile(new URL("../.vercelignore", import.meta.url), "utf8")
]);

function missingEntries(content, required) {
  const lines = new Set(content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  return required.filter((entry) => !lines.has(entry));
}

const missingGitIgnores = missingEntries(gitignore, requiredGitIgnores);
const missingVercelIgnores = missingEntries(vercelignore, requiredVercelIgnores);
const failures = [];

if (sidecars.length > 0) failures.push(`migration sidecars must be removed: ${sidecars.join(", ")}`);
if (invalidSqlNames.length > 0) failures.push(`invalid migration SQL filenames: ${invalidSqlNames.join(", ")}`);
if (missingGitIgnores.length > 0) failures.push(`missing .gitignore entries: ${missingGitIgnores.join(", ")}`);
if (missingVercelIgnores.length > 0) failures.push(`missing .vercelignore entries: ${missingVercelIgnores.join(", ")}`);

if (failures.length > 0) {
  console.error("Release hygiene check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  migrations: files.filter((name) => validMigrationName.test(name)).length,
  ignoredArtifactRules: {
    git: requiredGitIgnores.length,
    vercel: requiredVercelIgnores.length
  }
}, null, 2));
