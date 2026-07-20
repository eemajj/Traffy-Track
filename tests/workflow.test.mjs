import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canTransitionReport,
  getAllowedReportTransitions,
  validateReportWorkflowInput
} from "../lib/workflow.ts";

const migrationUrl = new URL("../supabase/migrations/20260714160000_workflow_core.sql", import.meta.url);
const readOnlyCasesMigrationUrl = new URL("../supabase/migrations/20260715234000_citydata_cases_read_only.sql", import.meta.url);
const immutableCasesMigrationUrl = new URL("../supabase/migrations/20260715234500_enforce_citydata_case_immutability.sql", import.meta.url);

test("report lifecycle only permits explicit forward/rework transitions", () => {
  assert.deepEqual(getAllowedReportTransitions("draft", "operator"), ["sent"]);
  assert.deepEqual(getAllowedReportTransitions("sent", "operator"), ["partially_returned", "complete"]);
  assert.deepEqual(getAllowedReportTransitions("partially_returned", "operator"), ["sent", "complete"]);
  assert.deepEqual(getAllowedReportTransitions("complete", "operator"), []);
  assert.deepEqual(getAllowedReportTransitions("complete", "admin"), ["locked"]);
  assert.equal(canTransitionReport("locked", "sent", "admin"), false);
});

test("workflow input rejects malformed ids, dates, and oversized next actions", () => {
  assert.throws(() => validateReportWorkflowInput({ batchId: "not-a-uuid" }), /รหัสรอบรายงาน/);
  assert.throws(
    () => validateReportWorkflowInput({ batchId: "8de05bbd-1970-4ab0-b91c-15d66d932506", dueDate: "15-07-2026" }),
    /วันที่ติดตาม/
  );
  assert.throws(
    () => validateReportWorkflowInput({ batchId: "8de05bbd-1970-4ab0-b91c-15d66d932506", nextAction: "x".repeat(2001) }),
    /2,000/
  );
});

test("workflow migration gates report creation without breaking historical restore, and enforces workflow invariants", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create table if not exists public\.ticket_assignment_events/i);
  assert.match(sql, /create table if not exists public\.report_workflow_events/i);
  assert.match(sql, /create_report_batch_snapshot_without_triage_gate/i);
  assert.match(sql, /v_unassigned_count > 0/i);
  assert.match(sql, /ปิดคิว Triage ก่อนสร้างรอบรายงาน/i);
  assert.doesNotMatch(sql, /create trigger enforce_report_item_assignment/i);
  assert.match(sql, /เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนฝ่ายเดิมได้/);
  assert.match(sql, /p_to_status = 'locked' and p_actor_role <> 'admin'/i);
  assert.match(sql, /version\.review_status <> 'approved'/i);
  assert.match(sql, /insert into public\.audit_events/i);
  assert.match(sql, /create or replace function public\.workflow_action_center/i);
});

test("report workflow API requires a signed session and keeps locking admin-only", async () => {
  const reportRoute = await readFile(new URL("../app/api/workflow/reports/[batchId]/route.ts", import.meta.url), "utf8");
  assert.match(reportRoute, /body\.toStatus === "locked" && claims\.role !== "admin"/);
});

test("CityData case fields are read-only and manual department assignment is retired", async () => {
  const [sql, immutableSql, casePage, workflow, permissions, session] = await Promise.all([
    readFile(readOnlyCasesMigrationUrl, "utf8"),
    readFile(immutableCasesMigrationUrl, "utf8"),
    readFile(new URL("../app/cases/[ticketId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/workflow.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/access-permissions.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/session.ts", import.meta.url), "utf8")
  ]);

  assert.match(sql, /drop function if exists public\.assign_ticket_departments/);
  assert.match(sql, /create_report_batch_snapshot_without_triage_gate/);
  assert.match(sql, /'report'::text as item_type/);
  assert.doesNotMatch(sql, /update public\.tickets|delete from public\.tickets|truncate/i);
  assert.match(immutableSql, /ข้อมูลฝ่ายมาจาก CityData และไม่สามารถแก้ไขในระบบนี้ได้/);
  assert.match(immutableSql, /from public, anon, authenticated, service_role/);
  assert.doesNotMatch(immutableSql, /update public\.tickets|insert into public\.tickets|delete from public\.tickets/i);
  assert.doesNotMatch(casePage, /TicketAssignmentPanel|getTicketAssignmentHistory/);
  assert.doesNotMatch(workflow, /assignTicketDepartments|getTicketAssignmentHistory|getTriageQueue/);
  assert.doesNotMatch(permissions, /cases:assign/);
  assert.doesNotMatch(session, /cases:assign/);
});

test("dashboard exposes action-center data without requiring dashboard page ownership", async () => {
  const [dashboard, dashboardPage] = await Promise.all([
    readFile(new URL("../lib/dashboard.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8")
  ]);
  assert.match(dashboard, /actionCenter: WorkflowActionItem\[\]/);
  assert.match(dashboard, /supabase\.rpc\("workflow_action_center"/);
  assert.match(dashboardPage, /WorkflowActionCenter items=\{data\.actionCenter\}/);
});

test("report workflow keeps user-facing controls and visible history", async () => {
  const [casePage, reportPage, lifecyclePanel] = await Promise.all([
    readFile(new URL("../app/cases/[ticketId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/report/[batchId]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/report/[batchId]/report-lifecycle-panel.tsx", import.meta.url), "utf8")
  ]);

  assert.doesNotMatch(casePage, /workflow\/assign|จัดฝ่าย/);
  assert.match(reportPage, /getReportWorkflowHistory/);
  assert.match(lifecyclePanel, /api\/workflow\/reports/);
  assert.match(lifecyclePanel, /ประวัติ Workflow/);
});
