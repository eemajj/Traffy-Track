import { performance } from "node:perf_hooks";
import process from "node:process";

import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const PRODUCTION_PROJECT_REF = "zllbfazkhrvlfutehkyh";
const STAGING_PROJECT_REF = "pyyoysdcedaskohiocdg";
const SOURCE_PATH = "incoming/1784380909474-13e8d2c7-cd5e-46a0-aa09-1a685dbe9a36-citydata-2026-07-18-20-14-27.csv";
const BUCKET = "traffy-track-imports";
const CHUNK_SIZE = 500;
const CONCURRENCY = 4;

if (process.env.SUPABASE_PROJECT_REF !== STAGING_PROJECT_REF) {
  throw new Error("Import profiling is restricted to the Staging project");
}

const productionUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const productionKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!productionUrl || !productionKey || !productionUrl.includes(PRODUCTION_PROJECT_REF)) {
  throw new Error("Production source environment is missing or points to the wrong project");
}

let input = "";
for await (const chunk of process.stdin) input += chunk;
const keys = JSON.parse(input);
const stagingKey = keys.find((item) => item.name === "service_role" && item.type === "legacy")?.api_key;
if (!stagingKey) throw new Error("Staging service-role key was not found");

const production = createClient(productionUrl, productionKey, { auth: { persistSession: false } });
const staging = createClient(`https://${STAGING_PROJECT_REF}.supabase.co`, stagingKey, { auth: { persistSession: false } });

const startedAt = performance.now();
const download = await production.storage.from(BUCKET).download(SOURCE_PATH);
if (download.error || !download.data) throw download.error || new Error("Production import source was not found");
const downloadedAt = performance.now();

const text = await download.data.text();
const parsed = Papa.parse(text, { header: true, skipEmptyLines: "greedy" });
if (parsed.errors.length > 0) throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
const ticketIdHeader = (parsed.meta.fields || []).find((field) => field.trim().toLowerCase() === "ticket_id");
if (!ticketIdHeader) throw new Error("ticket_id header was not found");
const ticketIds = [...new Set(parsed.data.map((row) => row[ticketIdHeader]?.trim()).filter(Boolean))];
const parsedAt = performance.now();

const chunks = [];
for (let index = 0; index < ticketIds.length; index += CHUNK_SIZE) chunks.push(ticketIds.slice(index, index + CHUNK_SIZE));
let existingRows = 0;
for (let index = 0; index < chunks.length; index += CONCURRENCY) {
  const results = await Promise.all(chunks.slice(index, index + CONCURRENCY).map((ids) =>
    staging.from("tickets").select(
      "ticket_id, type, comment, photo_url, address, subdistrict, district, province, timestamp, last_activity, state, org_response, org_list, dept_list, star, hashtag, lat, lng"
    ).in("ticket_id", ids)
  ));
  for (const result of results) {
    if (result.error) throw result.error;
    existingRows += result.data.length;
  }
}
const selectedAt = performance.now();

console.log(JSON.stringify({
  sourceProjectRef: PRODUCTION_PROJECT_REF,
  targetProjectRef: STAGING_PROJECT_REF,
  fileBytes: download.data.size,
  parsedRows: parsed.data.length,
  uniqueTicketIds: ticketIds.length,
  chunks: chunks.length,
  concurrency: CONCURRENCY,
  existingRows,
  timingsMs: {
    download: Math.round(downloadedAt - startedAt),
    parse: Math.round(parsedAt - downloadedAt),
    boundedSelect: Math.round(selectedAt - parsedAt),
    totalReadPhase: Math.round(selectedAt - startedAt)
  }
}, null, 2));
