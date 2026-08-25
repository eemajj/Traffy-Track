import assert from "node:assert/strict";
import test from "node:test";

import {
  BANGKOK_TIME_ZONE,
  formatBangkokDate,
  formatBangkokDateTime,
  formatBangkokTime
} from "../lib/date-utils.ts";

test("date-utils formats dates consistently in Bangkok timezone (UTC+7)", () => {
  // 2026-07-06 17:30 UTC = 2026-07-07 00:30 Bangkok
  const utcDate = new Date("2026-07-06T17:30:00.000Z");

  const formattedDateTime = formatBangkokDateTime(utcDate);
  // Must reflect July 7th 2569 / 2026, 00:30
  assert.match(formattedDateTime, /7\s+ก\.ค\.\s+2569/);
  assert.match(formattedDateTime, /00:30/);

  const formattedDate = formatBangkokDate(utcDate);
  assert.match(formattedDate, /7\s+ก\.ค\.\s+2569/);

  const formattedTime = formatBangkokTime(utcDate);
  assert.equal(formattedTime, "00:30");
});

test("date-utils gracefully handles null, undefined, empty, and invalid dates", () => {
  assert.equal(formatBangkokDateTime(null), "-");
  assert.equal(formatBangkokDateTime(undefined), "-");
  assert.equal(formatBangkokDateTime(""), "-");
  assert.equal(formatBangkokDateTime("invalid-date-string"), "-");

  assert.equal(formatBangkokDate(null), "-");
  assert.equal(formatBangkokTime(null), "-");
});

test("BANGKOK_TIME_ZONE constant is Asia/Bangkok", () => {
  assert.equal(BANGKOK_TIME_ZONE, "Asia/Bangkok");
});
