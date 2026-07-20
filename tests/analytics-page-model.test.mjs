import assert from "node:assert/strict";
import test from "node:test";
import { analyticsAgeBucketMeta, formatAnalyticsChange, formatAnalyticsDuration } from "../lib/analytics/page-model.ts";
test("analytics page model keeps operational labels and null fallbacks", () => {
  assert.equal(formatAnalyticsDuration(null), "ยังไม่มีข้อมูล");
  assert.equal(formatAnalyticsChange(null), "ยังไม่มีฐานเปรียบเทียบ");
  assert.equal(analyticsAgeBucketMeta.over_90.shortLabel, "> 90 วัน");
});
