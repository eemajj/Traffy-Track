import assert from "node:assert/strict";
import test from "node:test";
import { buildVisibleMapPoints, getMapCaseHref, getMapMarkerColor, getMapStatusMeta } from "../lib/map/page-model.ts";
test("map page model keeps status text alongside color and safe return links", () => {
  assert.equal(getMapMarkerColor("เสร็จสิ้น"), "#1f7a5a");
  assert.equal(getMapStatusMeta(null).label, "ไม่ระบุสถานะ");
  assert.match(getMapCaseHref("T/1", "/map?q=น้ำ"), /^\/cases\/T%2F1\?returnTo=/);
  const points = [{ ticket_id: "A" }, { ticket_id: "B" }, { ticket_id: "C" }];
  assert.deepEqual(buildVisibleMapPoints(points, ["C", "missing", "A"]), [points[2], points[0]]);
});
