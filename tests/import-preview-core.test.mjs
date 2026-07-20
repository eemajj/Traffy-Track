import assert from "node:assert/strict";
import test from "node:test";

import Papa from "papaparse";

import { trimPartialCsvToCompleteRecords } from "../lib/import/preview-core.ts";

test("partial preview trims an unterminated quoted multiline record", () => {
  const partial = [
    "ticket_id,comment,state",
    'A-1,"บรรทัดแรก',
    'บรรทัดที่สอง",เปิด',
    'A-2,"ข้อความที่ถูกตัด',
    "กลาง field"
  ].join("\n");

  const trimmed = trimPartialCsvToCompleteRecords(partial);
  const parsed = Papa.parse(trimmed, { header: true, skipEmptyLines: "greedy" });

  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.data, [{ ticket_id: "A-1", comment: "บรรทัดแรก\nบรรทัดที่สอง", state: "เปิด" }]);
});

test("partial preview preserves escaped quotes inside a complete record", () => {
  const partial = 'ticket_id,comment,state\r\nA-1,"ข้อความ ""สำคัญ""\r\nหลายบรรทัด",เปิด\r\nA-2,"ไม่ครบ';
  const trimmed = trimPartialCsvToCompleteRecords(partial);
  const parsed = Papa.parse(trimmed, { header: true, skipEmptyLines: "greedy" });

  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.data[0].comment, 'ข้อความ "สำคัญ"\r\nหลายบรรทัด');
  assert.equal(parsed.data.length, 1);
});
