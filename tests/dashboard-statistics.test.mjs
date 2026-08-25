import assert from "node:assert/strict";
import test from "node:test";

import {
  getBangkokRangeBounds,
  normalizeDashboardDateRange,
  summarizeDashboardTickets,
  validateDashboardDateRange
} from "../lib/dashboard/statistics.ts";

function ticket(id, state, options = {}) {
  const base = {
    ticket_id: id,
    type: options.type ?? "ถนน",
    timestamp: options.timestamp ?? "2026-07-01T00:00:00+07:00",
    last_activity: options.last_activity ?? "2026-07-02T00:00:00+07:00",
    state,
    star: options.star ?? null
  };
  if (options.ticket_origin !== undefined) base.ticket_origin = options.ticket_origin;
  return base;
}

test("dashboard date range validates real calendar dates and Bangkok half-open bounds", () => {
  assert.equal(validateDashboardDateRange({ from: "2026-02-31", to: "2026-03-01" }), "กรุณาระบุช่วงวันที่ให้ถูกต้อง");
  assert.equal(validateDashboardDateRange({ from: "2026-07-02", to: "2026-07-01" }), "วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด");
  assert.equal(validateDashboardDateRange({ from: "2024-02-29", to: "2024-02-29" }), null);
  assert.deepEqual(getBangkokRangeBounds({ from: "2026-07-01", to: "2026-07-31" }), {
    startAt: "2026-06-30T17:00:00.000Z",
    endAt: "2026-07-31T17:00:00.000Z"
  });
});

test("dashboard date range defaults to the full known CityData period", () => {
  assert.deepEqual(normalizeDashboardDateRange({}, "2026-07-19"), {
    from: "2022-05-22",
    to: "2026-07-19"
  });
});

test("Traffy-compatible state rollups reconcile to the selected cohort", () => {
  const rows = [
    ticket("1", "รอรับเรื่อง"),
    ticket("2", "รับเรื่อง"),
    ticket("3", "กำลังดำเนินการ"),
    ticket("4", "ศึกษาปัญหา"),
    ticket("5", "จัดทำนโยบาย"),
    ticket("6", "ของบประมาณ"),
    ticket("7", "จัดซื้อจัดจ้าง"),
    ticket("8", "ขั้นตอนทางกฎหมาย"),
    ticket("9", "เสร็จสิ้น", { star: 1 }),
    ticket("10", "เสร็จสิ้น", { star: 5 }),
    ticket("11", "ส่งต่อ(ใหม่)"),
    ticket("12", "ไม่เกี่ยวข้อง"),
    ticket("13", "ติดตามเรื่อง"),
    ticket("14", null)
  ];
  const result = summarizeDashboardTickets(rows, { from: "2026-07-01", to: "2026-07-31" }, "2026-07-19T00:00:00Z");

  assert.equal(result.total, 14);
  assert.equal(result.managed, 13);
  assert.equal(result.rollup.inProgress, 7);
  assert.equal(result.rollup.finish, 2);
  assert.equal(result.rollup.irrelevantRaw, 1);
  assert.equal(result.rollup.follow, 1);
  assert.equal(result.rollup.irrelevantAggregate, 2);
  assert.equal(result.unknownStateCount, 1);
  assert.equal(result.statusRows.reduce((sum, row) => sum + row.count, 0) + result.unknownStateCount, result.total);
});

test("finished low-rating feedback uses star 1-2 and the finished denominator", () => {
  const result = summarizeDashboardTickets([
    ticket("1", "เสร็จสิ้น", { star: 1 }),
    ticket("2", "เสร็จสิ้น", { star: 2 }),
    ticket("3", "เสร็จสิ้น", { star: 5 }),
    ticket("4", "กำลังดำเนินการ", { star: 1 })
  ], { from: "2026-07-01", to: "2026-07-31" });

  assert.equal(result.finishedLowRating.count, 2);
  assert.equal(result.finishedLowRating.percentOfFinished, 66.67);
  assert.equal(result.feedback.count, 4);
  assert.equal(result.feedback.average, 2.25);
  assert.equal(result.byThis.availability, "unavailable");
  assert.equal(result.resolutionTime.availability, "unavailable");
});

test("isExternalAgencyOrgResponse accurately distinguishes external agency responses from district departments", async () => {
  const { isExternalAgencyOrgResponse } = await import("../lib/dashboard/statistics.ts");

  assert.deepEqual(isExternalAgencyOrgResponse("การไฟฟ้านครหลวง"), { isExternal: true, externalOrgName: "การไฟฟ้านครหลวง" });
  assert.deepEqual(isExternalAgencyOrgResponse("การประปานครหลวง, สำนักการระบายน้ำ"), { isExternal: true, externalOrgName: "สำนักการระบายน้ำ" });
  assert.deepEqual(isExternalAgencyOrgResponse("ฝ่ายโยธา เขตทวีวัฒนา"), { isExternal: false, externalOrgName: null });
  assert.deepEqual(isExternalAgencyOrgResponse("การไฟฟ้านครหลวง, ฝ่ายเทศกิจ เขตทวีวัฒนา"), { isExternal: false, externalOrgName: null });
  assert.deepEqual(isExternalAgencyOrgResponse(null), { isExternal: false, externalOrgName: null });
});

test("isDistrictRelatedTicket filters out pure external tickets while preserving district-transferred and intake tickets", async () => {
  const { isDistrictRelatedTicket } = await import("../lib/import/normalize.ts");

  // Pure external ticket (finished/closed, no district dept/org/district) -> Excluded
  assert.equal(isDistrictRelatedTicket({ org_list: ["การไฟฟ้านครหลวง"], dept_list: [], district: "เขตอื่น", state: "เสร็จสิ้น" }), false);
  assert.equal(isDistrictRelatedTicket({ org_list: ["การประปานครหลวง"], dept_list: [], district: "เขตอื่น", state: "เสร็จสิ้น" }), false);

  // External ticket transferred to district department -> Preserved
  assert.equal(isDistrictRelatedTicket({ org_list: ["การไฟฟ้านครหลวง", "ฝ่ายโยธา เขตทวีวัฒนา"], dept_list: ["ฝ่ายโยธา เขตทวีวัฒนา"] }), true);

  // District intake ticket -> Preserved
  assert.equal(isDistrictRelatedTicket({ org_list: ["สำนักงานเขตทวีวัฒนา"], dept_list: [] }), true);

  // New intake ticket geofenced to district (unassigned yet) -> Safely Preserved
  assert.equal(isDistrictRelatedTicket({ org_list: [], dept_list: [], district: "เขตทวีวัฒนา", state: "รอรับเรื่อง" }), true);
});

test("external split separates forwarded-out from external-intake once origin data exists", () => {
  const summary = summarizeDashboardTickets(
    [
      ticket("T1", "ส่งต่อ(ใหม่)", { ticket_origin: "district_transferred" }),
      ticket("T2", "รับเรื่อง", { ticket_origin: "external_intake" }),
      ticket("T3", "เสร็จสิ้น", { star: 5, ticket_origin: "external_intake" })
    ],
    { from: "2026-07-01", to: "2026-07-31" }
  );

  assert.equal(summary.externalSplit.originDataAvailable, true);
  assert.equal(summary.externalSplit.transferredOut, 1);
  assert.equal(summary.externalSplit.externalIntake, 2);
});

test("external split falls back to legacy mode before the origin migration is applied", () => {
  const summary = summarizeDashboardTickets(
    [ticket("T1", "ส่งต่อ(ใหม่)"), ticket("T2", "กำลังดำเนินการ")],
    { from: "2026-07-01", to: "2026-07-31" }
  );

  assert.equal(summary.externalSplit.originDataAvailable, false);
  assert.equal(summary.externalSplit.transferredOut, 1);
  assert.equal(summary.externalSplit.externalIntake, 0);
});

