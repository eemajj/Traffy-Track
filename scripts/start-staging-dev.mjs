import { spawn } from "node:child_process";
import process from "node:process";

const STAGING_PROJECT_REF = "pyyoysdcedaskohiocdg";
const projectRef = process.env.SUPABASE_PROJECT_REF;
if (projectRef !== STAGING_PROJECT_REF) throw new Error("Staging dev is restricted to the Staging project");

let input = "";
for await (const chunk of process.stdin) input += chunk;
const keys = JSON.parse(input);
const serviceRole = keys.find((item) => item.name === "service_role" && item.type === "legacy")?.api_key;
const anonKey = keys.find((item) => item.name === "anon" && item.type === "legacy")?.api_key;
if (!serviceRole || !anonKey) throw new Error("Staging API keys were not found");

const child = spawn(
  "npm",
  ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000"],
  {
    env: {
      ...process.env,
      APP_ENV: "staging",
      SUPABASE_URL: `https://${projectRef}.supabase.co`,
      SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRole
    },
    stdio: ["ignore", "inherit", "inherit"]
  }
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
