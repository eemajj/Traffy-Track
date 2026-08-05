import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { dedupeTicketsById } from "../lib/import/dedupe.ts";
import { deriveDepartmentList } from "../lib/import/normalize.ts";
import { getCoHandlingDepartmentNote } from "../lib/report/co-handling-note.ts";
import { getBangkokCurrentMonthRange, getBangkokTodayValue } from "../lib/report-date.ts";
import { getSafeHttpsUrl } from "../lib/safe-url.ts";
import { parseCoordinates } from "../lib/coordinates.ts";
import { createSessionCookieValue, getSessionClaims, verifySessionCookieValue } from "../lib/session.ts";
import { getAnalyticsPeriodDays } from "../lib/analytics-period.ts";
import { buildPendingStatesOrFilter } from "../lib/tickets.ts";
import { compareCaseListItems, getCaseSortField, normalizeCaseListSort } from "../lib/case-sort.ts";
import { getEvidenceWorkflowState, summarizeEvidenceDepartments } from "../lib/evidence-workflow.ts";
import {
  getCsvRowValidationIssues,
  getTicketFieldChanges,
  preserveMissingOptionalFields
} from "../lib/import/integrity.ts";

function importTicket(overrides = {}) {
  return {
    ticket_id: "T-1",
    type: "ถนน",
    comment: "รายละเอียดเดิม",
    photo_url: "https://example.test/original.jpg",
    address: "ที่อยู่เดิม",
    subdistrict: "ศาลาธรรมสพน์",
    district: "ทวีวัฒนา",
    province: "กรุงเทพมหานคร",
    timestamp: "2026-07-01T00:00:00.000Z",
    last_activity: "2026-07-02T00:00:00.000Z",
    state: "รับเรื่องแล้ว",
    org_response: "ฝ่ายโยธา เขตทวีวัฒนา",
    org_list: ["ฝ่ายโยธา เขตทวีวัฒนา"],
    dept_list: ["ฝ่ายโยธา เขตทวีวัฒนา"],
    star: 4,
    hashtag: "#ถนน",
    lat: 13.76195,
    lng: 100.33389,
    ...overrides
  };
}

function csvRow(overrides = {}) {
  return {
    ticket_id: "T-1",
    type: "ถนน",
    comment: "รายละเอียด",
    photo: "",
    address: "",
    subdistrict: "ศาลาธรรมสพน์",
    district: "ทวีวัฒนา",
    province: "กรุงเทพมหานคร",
    timestamp: "2026-07-01T07:00:00+07:00",
    last_activity: "2026-07-02T07:00:00+07:00",
    state: "รับเรื่องแล้ว",
    org_response: "ฝ่ายโยธา เขตทวีวัฒนา",
    star: "4",
    hashtag: "",
    coords: "100.33389,13.76195",
    ...overrides
  };
}

test("department derivation filters out non-district external departments", () => {
  const orgList = [
    "กรุงเทพมหานคร",
    "เขตทวีวัฒนา",
    "ฝ่ายโยธา เขตทวีวัฒนา",
    "ฝ่ายเทศกิจ เขตทวีวัฒนา",
    "ฝ่ายเก็บขนมูลฝอย สยฝ. สสล.",
    "ฝ่ายจัดการยานพาหนะ สยฝ. สสล.",
    "ฝ่ายเทศกิจ เขตบางแค"
  ];
  const derived = deriveDepartmentList(orgList);
  assert.deepEqual(derived, ["ฝ่ายโยธา เขตทวีวัฒนา", "ฝ่ายเทศกิจ เขตทวีวัฒนา"]);
});

test("co-handling department note derives concise inviter and invitee format", () => {
  const deptList = ["ฝ่ายเทศกิจ เขตทวีวัฒนา", "ฝ่ายโยธา เขตทวีวัฒนา"];

  const note = getCoHandlingDepartmentNote({ deptList });
  assert.equal(note, "ฝ่ายเทศกิจ เชิญร่วม ฝ่ายโยธา");

  const singleDeptNote = getCoHandlingDepartmentNote({
    deptList: ["ฝ่ายเทศกิจ เขตทวีวัฒนา"]
  });
  assert.equal(singleDeptNote, "");
});

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

test("complaint map owns and cleans up its Leaflet instance", async () => {
  const source = await readFile(new URL("../components/complaint-map.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /from ["']react-leaflet["']/);
  assert.match(source, /map = L\.map\(container,/);
  assert.match(source, /map\.remove\(\);/);
  assert.match(source, /mapRef\.current = null;/);
  assert.match(source, /preferCanvas: true/);
  assert.match(source, /bindPopup\(\(\) => createPopupContent\(point\)\)/);
});

test("case registry supports received and updated date sorting in both directions", () => {
  const olderReceivedButNewerUpdated = {
    ticket_id: "A",
    timestamp: "2026-07-01T00:00:00.000Z",
    last_activity: "2026-07-10T00:00:00.000Z"
  };
  const newerReceivedButOlderUpdated = {
    ticket_id: "B",
    timestamp: "2026-07-05T00:00:00.000Z",
    last_activity: "2026-07-08T00:00:00.000Z"
  };

  assert.equal(normalizeCaseListSort(undefined), "updated-desc");
  assert.equal(normalizeCaseListSort("invalid"), "updated-desc");
  assert.equal(getCaseSortField("received-asc"), "timestamp");
  assert.equal(getCaseSortField("updated-desc"), "last_activity");
  assert.ok(compareCaseListItems(olderReceivedButNewerUpdated, newerReceivedButOlderUpdated, "received-asc") < 0);
  assert.ok(compareCaseListItems(olderReceivedButNewerUpdated, newerReceivedButOlderUpdated, "received-desc") > 0);
  assert.ok(compareCaseListItems(olderReceivedButNewerUpdated, newerReceivedButOlderUpdated, "updated-asc") > 0);
  assert.ok(compareCaseListItems(olderReceivedButNewerUpdated, newerReceivedButOlderUpdated, "updated-desc") < 0);
  assert.ok(compareCaseListItems({ ...olderReceivedButNewerUpdated, timestamp: null }, newerReceivedButOlderUpdated, "received-asc") > 0);
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
  assert.equal(
    getSafeHttpsUrl(
      "https://storage.googleapis.com/traffy_public_bucket/{https://storage.googleapis.com/traffy_public_bucket/attachment/2026-07/6f6db269ebc343d4143a941fe67b26e8.jpeg}"
    ),
    "https://storage.googleapis.com/traffy_public_bucket/attachment/2026-07/6f6db269ebc343d4143a941fe67b26e8.jpeg"
  );
  assert.equal(
    getSafeHttpsUrl(
      "https://storage.googleapis.com/traffy_public_bucket/%7Bhttps://storage.googleapis.com/traffy_public_bucket/attachment/2026-07/6f6db269ebc343d4143a941fe67b26e8.jpeg%7D"
    ),
    "https://storage.googleapis.com/traffy_public_bucket/attachment/2026-07/6f6db269ebc343d4143a941fe67b26e8.jpeg"
  );
  assert.equal(
    getSafeHttpsUrl("https://storage.googleapis.com/traffy_public_bucket/{https://evil.example/photo.jpg}"),
    null
  );
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

test("analytics period only accepts supported windows", () => {
  assert.equal(getAnalyticsPeriodDays("30"), 30);
  assert.equal(getAnalyticsPeriodDays("90"), 90);
  assert.equal(getAnalyticsPeriodDays("180"), 180);
  assert.equal(getAnalyticsPeriodDays("365"), 90);
  assert.equal(getAnalyticsPeriodDays(["30", "180"]), 30);
  assert.equal(getAnalyticsPeriodDays(undefined), 90);
});

test("pending-state filter explicitly includes null states", () => {
  assert.equal(
    buildPendingStatesOrFilter(),
    'state.is.null,state.not.in.("เสร็จสิ้น","ไม่เกี่ยวข้อง","ส่งต่อ(ใหม่)")'
  );
  assert.equal(
    buildPendingStatesOrFilter("tickets."),
    'tickets.state.is.null,tickets.state.not.in.("เสร็จสิ้น","ไม่เกี่ยวข้อง","ส่งต่อ(ใหม่)")'
  );
});

test("CSV row validation reports blank identity and malformed typed values with the source row", () => {
  const issues = getCsvRowValidationIssues(
    csvRow({
      ticket_id: " ",
      state: "",
      timestamp: "not-a-date",
      coords: "outside,world",
      star: "4.5"
    }),
    17
  );

  assert.deepEqual(
    issues.map(({ rowNumber, field }) => [rowNumber, field]),
    [
      [17, "ticket_id"],
      [17, "state"],
      [17, "timestamp"],
      [17, "coords"],
      [17, "star"]
    ]
  );
});

test("missing optional CSV columns preserve existing ticket values", () => {
  const existing = importTicket();
  const incoming = importTicket({ photo_url: null, address: null, star: null, hashtag: null, lat: null, lng: null });
  const merged = preserveMissingOptionalFields(incoming, existing, {
    ticket_id: "ticket_id",
    state: "state"
  });

  assert.equal(merged.photo_url, existing.photo_url);
  assert.equal(merged.address, existing.address);
  assert.equal(merged.star, existing.star);
  assert.equal(merged.hashtag, existing.hashtag);
  assert.equal(merged.lat, existing.lat);
  assert.equal(merged.lng, existing.lng);
});

test("comment-only and coordinate-only edits are detected while equivalent timestamps are ignored", () => {
  const existing = importTicket();
  const incoming = importTicket({
    comment: "รายละเอียดใหม่",
    timestamp: "2026-07-01T07:00:00+07:00",
    lat: 13.762
  });
  const changes = getTicketFieldChanges(existing, incoming);

  assert.deepEqual(changes.map((change) => change.changed_field), ["comment", "coords"]);
});

test("evidence workflow distinguishes missing, review, rejected, and approved without trusting upload alone", () => {
  assert.equal(getEvidenceWorkflowState({ evidence_file_url: null, evidence_review_status: null }), "missing");
  assert.equal(getEvidenceWorkflowState({ evidence_file_url: "legacy.pdf", evidence_review_status: null }), "pending_review");
  assert.equal(getEvidenceWorkflowState({ evidence_file_url: "legacy.pdf", evidence_review_status: "legacy_unverified" }), "pending_review");
  assert.equal(getEvidenceWorkflowState({ evidence_file_url: "pending.pdf", evidence_review_status: "pending" }), "pending_review");
  assert.equal(getEvidenceWorkflowState({ evidence_file_url: "rejected.pdf", evidence_review_status: "rejected" }), "rejected");
  assert.equal(getEvidenceWorkflowState({ evidence_file_url: "approved.pdf", evidence_review_status: "approved" }), "approved");
});

test("report evidence is complete only when every current department version is approved", () => {
  const mixed = summarizeEvidenceDepartments([
    { evidence_file_url: null, evidence_review_status: null },
    { evidence_file_url: "pending.pdf", evidence_review_status: "pending" },
    { evidence_file_url: "rejected.pdf", evidence_review_status: "rejected" },
    { evidence_file_url: "approved.pdf", evidence_review_status: "approved" }
  ]);

  assert.deepEqual(
    [mixed.evidenceMissingCount, mixed.evidencePendingReviewCount, mixed.evidenceRejectedCount, mixed.evidenceApprovedCount],
    [1, 1, 1, 1]
  );
  assert.equal(mixed.evidencePendingCount, 3);
  assert.equal(mixed.evidenceProgressPercent, 25);
  assert.equal(mixed.completionStatus, "incomplete");

  const complete = summarizeEvidenceDepartments([
    { evidence_file_url: "one.pdf", evidence_review_status: "approved" },
    { evidence_file_url: "two.pdf", evidence_review_status: "approved" }
  ]);
  assert.equal(complete.completionStatus, "complete");
  assert.equal(complete.evidenceProgressPercent, 100);
  assert.equal(summarizeEvidenceDepartments([]).completionStatus, "incomplete");
});
