import { spawnSync } from "node:child_process";

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
