import { readFile } from "node:fs/promises";

import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const sourcePath = process.argv[2];
const CHUNK_SIZE = 500;

if (!sourcePath) {
  throw new Error("Usage: node scripts/backfill-coordinates.mjs <source.csv>");
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

function parseCityDataCoords(value) {
  const parts = String(value || "")
    .split(",")
    .map((part) => Number.parseFloat(part.trim()));

  if (parts.length !== 2 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  const [first, second] = parts;
  if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
    return { lat: second, lng: first };
  }

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return { lat: first, lng: second };
  }

  return null;
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

const csv = await readFile(sourcePath, "utf8");
const parsed = Papa.parse(csv, { header: true, skipEmptyLines: "greedy" });

if (parsed.errors.length > 0) {
  throw new Error(`CSV parse failed: ${parsed.errors[0].message}`);
}

const coordinateByTicketId = new Map();
for (const row of parsed.data) {
  const ticketId = String(row.ticket_id || "").trim();
  const coords = parseCityDataCoords(row.coords);
  if (ticketId && coords && !coordinateByTicketId.has(ticketId)) {
    coordinateByTicketId.set(ticketId, coords);
  }
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

let matchedTickets = 0;
let updatedTickets = 0;
let alreadyMappedTickets = 0;

for (const ticketIdChunk of chunk([...coordinateByTicketId.keys()], CHUNK_SIZE)) {
  const { data, error } = await supabase.from("tickets").select("ticket_id, lat, lng").in("ticket_id", ticketIdChunk);
  if (error) {
    throw new Error(`Failed to read existing coordinates: ${error.message}`);
  }

  const updates = [];
  for (const ticket of data || []) {
    matchedTickets += 1;
    if (ticket.lat !== null || ticket.lng !== null) {
      alreadyMappedTickets += 1;
      continue;
    }

    const coords = coordinateByTicketId.get(ticket.ticket_id);
    if (coords) {
      updates.push({ ticket_id: ticket.ticket_id, ...coords });
    }
  }

  if (updates.length === 0) {
    continue;
  }

  const { error: updateError } = await supabase.from("tickets").upsert(updates, { onConflict: "ticket_id" });
  if (updateError) {
    throw new Error(`Failed to update coordinates: ${updateError.message}`);
  }

  updatedTickets += updates.length;
}

console.log(
  JSON.stringify({
    sourceRows: parsed.data.length,
    validCoordinateRows: coordinateByTicketId.size,
    matchedTickets,
    updatedTickets,
    alreadyMappedTickets
  })
);
