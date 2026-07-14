import { spawnSync } from "node:child_process";
import process from "node:process";

import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const STAGING_PROJECT_REF = "pyyoysdcedaskohiocdg";
const PRODUCTION_PROJECT_REF = "zllbfazkhrvlfutehkyh";

loadEnvConfig(process.cwd());

let input = "";
for await (const chunk of process.stdin) input += chunk;
const keys = JSON.parse(input);
const serviceRole = keys.find((item) => item.name === "service_role" && item.type === "legacy")?.api_key;
const anonKey = keys.find((item) => item.name === "anon" && item.type === "legacy")?.api_key;
if (!serviceRole || !anonKey) throw new Error("Staging API keys were not found");

const values = {
  ...(process.env.APP_ADMIN_PASSCODE ? { APP_ADMIN_PASSCODE: process.env.APP_ADMIN_PASSCODE } : {}),
  APP_AUTH_COOKIE: process.env.APP_AUTH_COOKIE || "citydata-passcode",
  APP_ENV: "staging",
  APP_PASSCODE: process.env.APP_PASSCODE,
  APP_SESSION_SECRET: process.env.APP_SESSION_SECRET,
  ...(process.env.CRON_SECRET ? { CRON_SECRET: process.env.CRON_SECRET } : {}),
  SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRole,
  SUPABASE_URL: `https://${STAGING_PROJECT_REF}.supabase.co`
};

if (values.SUPABASE_URL.includes(PRODUCTION_PROJECT_REF)) {
  throw new Error("Refusing to configure Preview with Production Supabase");
}
for (const [name, value] of Object.entries(values)) {
  if (!value) throw new Error(`${name} is required for the Staging Preview`);
  const result = spawnSync(
    "npx",
    ["vercel", "env", "add", name, "preview", "--force", "--sensitive", "--yes"],
    { input: value, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`Could not configure Preview variable ${name}: ${result.stderr || result.stdout}`);
  }
  console.log(`${name}=configured`);
}
