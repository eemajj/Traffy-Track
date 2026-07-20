import assert from "node:assert/strict";
import test from "node:test";
import { buildCasesHref, formatCaseChangeField, formatCaseDepartments, getCaseStatusClassName } from "../lib/cases/page-model.ts";

test("case page model keeps stable links, labels and non-color status semantics", () => {
  assert.equal(buildCasesHref({ view: "pending", page: 2, q: null }), "/cases?view=pending&page=2");
  assert.equal(formatCaseDepartments([]), "ยังไม่มีฝ่าย");
  assert.equal(formatCaseChangeField("reopened"), "เปิดกลับ");
  assert.match(getCaseStatusClassName("เสร็จสิ้น"), /success|warning|muted/);
});
