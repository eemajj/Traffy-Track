import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function checkMigrationLog() {
  const migrationsDir = path.resolve("supabase/migrations");
  const files = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql") && !name.startsWith("._"));

  const log = await readFile(path.resolve("docs/MIGRATIONS.md"), "utf8");
  const missing = files.filter((name) => !log.includes(name));

  if (missing.length > 0) {
    console.error("\nMigration log check failed — document these in docs/MIGRATIONS.md:");
    for (const name of missing) console.error(`- ${name}`);
    process.exit(1);
  }
  console.log("\nMigration log check passed.");
}

await checkMigrationLog();

const checks = [
  ["npm", ["run", "check:release-hygiene"]],
  ["npm", ["test"]],
  ["npm", ["run", "typecheck"]],
  ["npm", ["run", "lint"]],
  ["npm", ["run", "build"]]
];

for (const [command, args] of checks) {
  const label = `${command} ${args.join(" ")}`;
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    console.error(`\nPredeploy check failed: ${label}`);
    process.exit(result.status || 1);
  }
}

console.log("\nPredeploy checks passed.");
