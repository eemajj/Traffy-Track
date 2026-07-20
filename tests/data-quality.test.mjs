import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { analyzeDataQualitySignals } from "../lib/data-quality.ts";

function ticket(overrides = {}) {
  return {
    ticket_id: "T-1",
    type: null,
    comment: null,
    address: null,
    org_response: null,
    dept_list: [],
    hashtag: null,
    lat: null,
    lng: null,
    ...overrides
  };
}

test("semantic duplicate signal requires matching complaint and nearby location", () => {
  const signals = analyzeDataQualitySignals([
    ticket({
      ticket_id: "A-1",
      comment: "ถนนหน้าหมู่บ้านชำรุดเป็นหลุมบ่อ รถสัญจรลำบาก",
      address: "ถนนบรมราชชนนี แขวงศาลาธรรมสพน์",
      lat: 13.76195,
      lng: 100.33389
    }),
    ticket({
      ticket_id: "A-2",
      comment: "ถนนหน้าหมู่บ้านชำรุดเป็นหลุมบ่อ รถสัญจรลำบาก",
      address: "ถนนบรมราชชนนี แขวงศาลาธรรมสพน์",
      lat: 13.7621,
      lng: 100.33395
    })
  ]);

  assert.equal(signals.semanticDuplicateGroupCount, 1);
  assert.equal(signals.semanticDuplicateTicketCount, 2);
  assert.deepEqual(signals.semanticDuplicateExamples[0].ticketIds, ["A-1", "A-2"]);
});

test("semantic duplicate signal stays conservative when coordinates disagree", () => {
  const signals = analyzeDataQualitySignals([
    ticket({ ticket_id: "A-1", comment: "มีขยะตกค้างจำนวนมากส่งกลิ่นรบกวนชุมชน", address: "ซอยเดียวกัน", lat: 13.75, lng: 100.35 }),
    ticket({ ticket_id: "A-2", comment: "มีขยะตกค้างจำนวนมากส่งกลิ่นรบกวนชุมชน", address: "ซอยเดียวกัน", lat: 13.76, lng: 100.35 })
  ]);

  assert.equal(signals.semanticDuplicateGroupCount, 0);
});

test("department suggestions only describe unassigned rows with a clear keyword lead", () => {
  const signals = analyzeDataQualitySignals([
    ticket({ ticket_id: "Y-1", type: "ถนน", comment: "ถนนชำรุดเป็นหลุมบ่อ" }),
    ticket({ ticket_id: "Y-2", comment: "ถนนชำรุดเป็นหลุมบ่อ", dept_list: ["ฝ่ายโยธา เขตทวีวัฒนา"] })
  ]);

  assert.equal(signals.departmentSuggestionCount, 1);
  assert.equal(signals.departmentSuggestionExamples[0].ticketId, "Y-1");
  assert.equal(signals.departmentSuggestionExamples[0].category, "งานโยธา");
});

test("attention hints expose transparent keyword matches without mutating input", () => {
  const input = [
    ticket({ ticket_id: "R-1", comment: "พบฝาท่อหาย อาจเกิดอุบัติเหตุ" }),
    ticket({ ticket_id: "R-2", comment: "แจ้งหลายครั้งแล้วยังไม่แก้" })
  ];
  const before = structuredClone(input);
  const signals = analyzeDataQualitySignals(input);

  assert.equal(signals.urgentAttentionCount, 1);
  assert.equal(signals.reviewAttentionCount, 1);
  assert.equal(signals.attentionExamples[0].label, "ควรเร่งตรวจสอบ");
  assert.deepEqual(input, before);
});

test("invalid imports expose a full downloadable correction artifact", async () => {
  const [generator, route, client] = await Promise.all([
    readFile(new URL("../lib/import/correction.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/import/correction/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/import/import-preview.tsx", import.meta.url), "utf8")
  ]);

  assert.match(generator, /getCsvRowValidationIssues/);
  assert.match(generator, /duplicate_ticket_id/);
  assert.match(generator, /suggested_action/);
  assert.match(route, /requireApiSession/);
  assert.match(route, /X-Correction-Issue-Count/);
  assert.match(client, /ดาวน์โหลดรายการที่ต้องแก้/);
});
