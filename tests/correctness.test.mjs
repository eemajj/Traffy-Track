import assert from "node:assert/strict";
import test from "node:test";

import { dedupeTicketsById } from "../lib/import/dedupe.ts";
import { getBangkokCurrentMonthRange, getBangkokTodayValue } from "../lib/report-date.ts";
import { getSafeHttpsUrl } from "../lib/safe-url.ts";

test("duplicate tickets keep the first CSV row", () => {
  const result = dedupeTicketsById([
    { ticket_id: "A-1", state: "first" },
    { ticket_id: "B-1", state: "only" },
    { ticket_id: "A-1", state: "second" },
    { ticket_id: "A-1", state: "third" }
  ]);

  assert.deepEqual(result.ticketRecords, [
    { ticket_id: "A-1", state: "first" },
    { ticket_id: "B-1", state: "only" }
  ]);
  assert.equal(result.duplicateRows, 2);
});

test("Bangkok report dates do not fall back to the previous UTC day", () => {
  const beforeBangkokMorning = new Date("2026-07-10T18:30:00.000Z");

  assert.equal(getBangkokTodayValue(beforeBangkokMorning), "2026-07-11");
  assert.deepEqual(getBangkokCurrentMonthRange(beforeBangkokMorning), {
    start: "2026-07-01",
    end: "2026-07-31"
  });
});

test("Bangkok month range handles the local month boundary and leap year", () => {
  const bangkokLeapDay = new Date("2024-02-29T16:59:59.000Z");

  assert.equal(getBangkokTodayValue(bangkokLeapDay), "2024-02-29");
  assert.deepEqual(getBangkokCurrentMonthRange(bangkokLeapDay), {
    start: "2024-02-01",
    end: "2024-02-29"
  });
});

test("external photo URLs only allow canonical HTTPS links", () => {
  assert.equal(getSafeHttpsUrl(" https://images.example.test/a b.jpg "), "https://images.example.test/a%20b.jpg");
  assert.equal(getSafeHttpsUrl("javascript:alert(1)"), null);
  assert.equal(getSafeHttpsUrl("data:image/png;base64,AAAA"), null);
  assert.equal(getSafeHttpsUrl("http://images.example.test/photo.jpg"), null);
  assert.equal(getSafeHttpsUrl("https://user:secret@images.example.test/photo.jpg"), null);
  assert.equal(getSafeHttpsUrl("not a url"), null);
});
