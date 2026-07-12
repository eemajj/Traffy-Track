import assert from "node:assert/strict";
import test from "node:test";

import { dedupeTicketsById } from "../lib/import/dedupe.ts";
import { getBangkokCurrentMonthRange, getBangkokTodayValue } from "../lib/report-date.ts";
import { getSafeHttpsUrl } from "../lib/safe-url.ts";
import { parseCoordinates } from "../lib/coordinates.ts";
import { createSessionCookieValue, getSessionClaims, verifySessionCookieValue } from "../lib/session.ts";

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

test("CityData longitude,latitude coordinates normalize to latitude,longitude", () => {
  const coords = parseCoordinates("100.33389,13.76195");

  assert.equal(coords.lat, 13.76195);
  assert.equal(coords.lng, 100.33389);
});

test("signed sessions preserve roles and reject tampering", async () => {
  const previousSecret = process.env.APP_SESSION_SECRET;
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-longer-than-32-bytes";

  try {
    const token = await createSessionCookieValue("operator", 60);
    const claims = await getSessionClaims(token);

    assert.equal(claims?.role, "operator");
    assert.equal(await verifySessionCookieValue(token), true);
    assert.equal(await verifySessionCookieValue(`${token}tampered`), false);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.APP_SESSION_SECRET;
    } else {
      process.env.APP_SESSION_SECRET = previousSecret;
    }
  }
});

test("signed sessions reject expired tokens", async () => {
  const previousSecret = process.env.APP_SESSION_SECRET;
  process.env.APP_SESSION_SECRET = "test-session-secret-that-is-longer-than-32-bytes";

  try {
    const token = await createSessionCookieValue("admin", -1);
    assert.equal(await getSessionClaims(token), null);
    assert.equal(await verifySessionCookieValue(token), false);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.APP_SESSION_SECRET;
    } else {
      process.env.APP_SESSION_SECRET = previousSecret;
    }
  }
});
