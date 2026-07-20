begin;

-- Case fields imported from CityData are read-only in this application. Keep
-- historical assignment events for audit/backup compatibility, but remove the
-- only database function that could mutate tickets.dept_list manually.
drop function if exists public.assign_ticket_departments(text, text[], text, text, boolean);

-- Report snapshots use department values exactly as received from CityData.
-- Tickets without a source department remain visible as a data-quality signal,
-- but they no longer block creation of a report batch.
create or replace function public.create_report_batch_snapshot(
  p_report_date date,
  p_note text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  return public.create_report_batch_snapshot_without_triage_gate(
    p_report_date,
    p_note,
    p_idempotency_key
  );
end;
$$;

revoke execute on function public.create_report_batch_snapshot(date, text, uuid)
from public, anon, authenticated;
grant execute on function public.create_report_batch_snapshot(date, text, uuid)
to service_role;

-- The action centre now contains report workflow only. Missing departments are
-- observations from CityData, not tasks that users can resolve in this system.
create or replace function public.workflow_action_center(p_today date default current_date)
returns table (
  item_type text, resource_id text, title text, detail text, workflow_status text,
  owner text, due_date date, is_overdue boolean, priority integer, href text, created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    'report'::text as item_type,
    batch.id::text as resource_id,
    'ติดตามรอบรายงาน ' || to_char(batch.report_date, 'DD/MM/YYYY') as title,
    coalesce(nullif(batch.next_action, ''), 'กำหนดเจ้าของและสิ่งที่ต้องทำต่อ') as detail,
    batch.lifecycle_status as workflow_status,
    batch.owner,
    batch.due_date,
    batch.due_date < p_today as is_overdue,
    case when batch.due_date < p_today then 1 when batch.due_date = p_today then 2 else 20 end as priority,
    '/report/' || batch.id::text as href,
    batch.created_at
  from public.report_batches as batch
  where batch.lifecycle_status <> 'locked'
    and (batch.due_date <= p_today or batch.owner is null or batch.next_action is null)
  order by priority asc, batch.due_date asc nulls last, batch.created_at asc, batch.id asc
  limit 100;
$$;

revoke execute on function public.workflow_action_center(date)
from public, anon, authenticated;
grant execute on function public.workflow_action_center(date)
to service_role;

-- Retire the removed action permission while preserving every other access
-- setting. No current Production profile contains this permission; this is a
-- defensive migration for restored or older environments.
update public.passcode_profiles
set permissions = array_remove(permissions, 'cases:assign')
where 'cases:assign' = any(permissions);

alter table public.passcode_profiles
  drop constraint if exists passcode_profiles_permissions_allowed_check;

alter table public.passcode_profiles
  add constraint passcode_profiles_permissions_allowed_check check (
    cardinality(permissions) > 0
    and permissions <@ array[
      'dashboard:view', 'analytics:view', 'analytics:export', 'map:view',
      'cases:view', 'import:manage', 'reports:manage', 'reports:create',
      'reports:export', 'reports:evidence', 'admin:manage', 'admin:access',
      'admin:backup', 'admin:operations', 'system:maintenance'
    ]::text[]
  );

commit;
