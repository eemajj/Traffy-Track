begin;

-- Every subquery belongs to one SQL statement, so PostgreSQL evaluates the
-- complete database artifact against one MVCC snapshot.
create or replace function public.create_system_backup_snapshot()
returns jsonb
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'snapshotId', gen_random_uuid(),
    'generatedAt', statement_timestamp(),
    'tables', jsonb_build_object(
      'tickets', coalesce((select jsonb_agg(to_jsonb(row) order by row.ticket_id) from public.tickets as row), '[]'::jsonb),
      'ticket_history', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.ticket_history as row), '[]'::jsonb),
      'import_batches', coalesce((select jsonb_agg(to_jsonb(row) order by row.imported_at, row.id) from public.import_batches as row), '[]'::jsonb),
      'report_batches', coalesce((select jsonb_agg(to_jsonb(row) order by row.created_at, row.id) from public.report_batches as row), '[]'::jsonb),
      'report_batch_departments', coalesce((select jsonb_agg(to_jsonb(row) order by row.report_batch_id, row.dept_name) from public.report_batch_departments as row), '[]'::jsonb),
      'report_batch_items', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.report_batch_items as row), '[]'::jsonb),
      'report_archives', coalesce((select jsonb_agg(to_jsonb(row) order by row.archived_at, row.id) from public.report_archives as row), '[]'::jsonb),
      'ticket_assignment_events', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.ticket_assignment_events as row), '[]'::jsonb),
      'report_workflow_events', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.report_workflow_events as row), '[]'::jsonb),
      'report_evidence_versions', coalesce((select jsonb_agg(to_jsonb(row) order by row.report_batch_department_id, row.version_number) from public.report_evidence_versions as row), '[]'::jsonb),
      'report_evidence_status_events', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.report_evidence_status_events as row), '[]'::jsonb),
      'audit_events', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.audit_events as row), '[]'::jsonb)
    )
  );
$$;

revoke execute on function public.create_system_backup_snapshot()
from public, anon, authenticated;
grant execute on function public.create_system_backup_snapshot()
to service_role;

-- Restore append-only operational history with its original identity values.
-- The caller clears trigger-generated rows before invoking this function.
create or replace function public.restore_operational_history_snapshot(
  p_assignments jsonb,
  p_workflow jsonb,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment_count integer;
  workflow_count integer;
  audit_count integer;
begin
  lock table public.ticket_assignment_events in exclusive mode;
  lock table public.report_workflow_events in exclusive mode;
  lock table public.audit_events in exclusive mode;

  if exists (select 1 from public.ticket_assignment_events)
    or exists (select 1 from public.report_workflow_events)
    or exists (select 1 from public.audit_events) then
    raise exception 'Operational history tables must be empty before restore';
  end if;

  insert into public.ticket_assignment_events (
    id, ticket_id, occurred_at, actor_role, old_departments,
    new_departments, manual_override, reason
  ) overriding system value
  select
    row.id, row.ticket_id, row.occurred_at, row.actor_role,
    row.old_departments, row.new_departments, row.manual_override, row.reason
  from jsonb_to_recordset(coalesce(p_assignments, '[]'::jsonb)) as row(
    id bigint, ticket_id text, occurred_at timestamptz, actor_role text,
    old_departments text[], new_departments text[], manual_override boolean, reason text
  );
  get diagnostics assignment_count = row_count;

  insert into public.report_workflow_events (
    id, report_batch_id, occurred_at, actor_role, from_status, to_status,
    owner, due_date, next_action, note
  ) overriding system value
  select
    row.id, row.report_batch_id, row.occurred_at, row.actor_role,
    row.from_status, row.to_status, row.owner, row.due_date, row.next_action, row.note
  from jsonb_to_recordset(coalesce(p_workflow, '[]'::jsonb)) as row(
    id bigint, report_batch_id uuid, occurred_at timestamptz, actor_role text,
    from_status text, to_status text, owner text, due_date date, next_action text, note text
  );
  get diagnostics workflow_count = row_count;

  insert into public.audit_events (
    id, occurred_at, actor_role, action, resource_type, resource_id, outcome, metadata
  ) overriding system value
  select
    row.id, row.occurred_at, row.actor_role, row.action,
    row.resource_type, row.resource_id, row.outcome, row.metadata
  from jsonb_to_recordset(coalesce(p_audit, '[]'::jsonb)) as row(
    id bigint, occurred_at timestamptz, actor_role text, action text,
    resource_type text, resource_id text, outcome text, metadata jsonb
  );
  get diagnostics audit_count = row_count;

  perform setval(
    pg_get_serial_sequence('public.ticket_assignment_events', 'id'),
    coalesce((select max(id) from public.ticket_assignment_events), 1),
    exists (select 1 from public.ticket_assignment_events)
  );
  perform setval(
    pg_get_serial_sequence('public.report_workflow_events', 'id'),
    coalesce((select max(id) from public.report_workflow_events), 1),
    exists (select 1 from public.report_workflow_events)
  );
  perform setval(
    pg_get_serial_sequence('public.audit_events', 'id'),
    coalesce((select max(id) from public.audit_events), 1),
    exists (select 1 from public.audit_events)
  );

  return jsonb_build_object(
    'assignments', assignment_count,
    'workflow', workflow_count,
    'audit', audit_count
  );
end;
$$;

revoke execute on function public.restore_operational_history_snapshot(jsonb, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.restore_operational_history_snapshot(jsonb, jsonb, jsonb)
to service_role;

commit;
