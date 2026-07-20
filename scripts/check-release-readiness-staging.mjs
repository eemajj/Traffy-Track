import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const STAGING_PROJECT_REF = "pyyoysdcedaskohiocdg";
if (process.env.SUPABASE_PROJECT_REF !== STAGING_PROJECT_REF) {
  throw new Error("Release readiness check is restricted to the Staging project");
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const keys = JSON.parse(input);
const serviceRole = keys.find((item) => item.name === "service_role" && item.type === "legacy")?.api_key;
if (!serviceRole) throw new Error("Staging service-role key was not found");

const supabase = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false }
});

async function count(table, statuses) {
  const result = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .in("status", statuses);
  if (result.error) throw result.error;
  return result.count ?? 0;
}

const [activeImports, activeOutbox, deadOutbox] = await Promise.all([
  count("import_batches", ["queued", "running"]),
  count("storage_deletion_outbox", ["pending", "processing"]),
  count("storage_deletion_outbox", ["dead"])
]);

if (activeImports > 0 || activeOutbox > 0) {
  throw new Error(`Staging is busy: ${activeImports} active imports, ${activeOutbox} active outbox jobs`);
}

console.log(JSON.stringify({
  projectRef: STAGING_PROJECT_REF,
  ready: true,
  activeImports,
  activeOutbox,
  deadOutbox
}, null, 2));
