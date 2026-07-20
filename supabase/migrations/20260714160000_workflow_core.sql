begin;

-- Workflow metadata is additive so existing report readers and archives remain valid.
alter table public.report_batches
  add column if not exists lifecycle_status text not null default 'draft',
  add column if not exists owner text,
  add column if not exists due_date date,
  add column if not exists next_action text,
  add column if not exists status_updated_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz,
  add column if not exists created_by_role text not null default 'system';

alter table public.report_batches
  drop constraint if exists report_batches_lifecycle_status_check,
  add constraint report_batches_lifecycle_status_check
    check (lifecycle_status in ('draft', 'sent', 'partially_returned', 'complete', 'locked')),
  drop constraint if exists report_batches_created_by_role_check,
  add constraint report_batches_created_by_role_check
    check (created_by_role in ('admin', 'operator', 'system')),
  drop constraint if exists report_batches_lock_consistency_check,
  add constraint report_batches_lock_consistency_check
    check ((lifecycle_status = 'locked') = (locked_at is not null));

create table if not exists public.ticket_assignment_events (
  id bigint generated always as identity primary key,
  ticket_id text not null references public.tickets(ticket_id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_role text not null check (actor_role in ('admin', 'operator', 'system')),
  old_departments text[] not null default '{}',
  new_departments text[] not null default '{}',
  manual_override boolean not null default false,
  reason text
);

create index if not exists idx_ticket_assignment_events_ticket
  on public.ticket_assignment_events (ticket_id, occurred_at desc, id desc);

create table if not exists public.report_workflow_events (
  id bigint generated always as identity primary key,
  report_batch_id uuid not null references public.report_batches(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_role text not null check (actor_role in ('admin', 'operator', 'system')),
  from_status text,
  to_status text not null check (to_status in ('draft', 'sent', 'partially_returned', 'complete', 'locked')),
  owner text,
  due_date date,
  next_action text,
  note text
);

create index if not exists idx_report_workflow_events_batch
  on public.report_workflow_events (report_batch_id, occurred_at desc, id desc);

insert into public.report_workflow_events (
  report_batch_id, occurred_at, actor_role, from_status, to_status,
  owner, due_date, next_action, note
)
select
  batch.id, batch.created_at, batch.created_by_role, null, batch.lifecycle_status,
  batch.owner, batch.due_date, batch.next_action, 'backfilled workflow state'
from public.report_batches as batch
where not exists (
  select 1 from public.report_workflow_events as event
  where event.report_batch_id = batch.id
);

create or replace function public.record_initial_report_workflow_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.report_workflow_events (
    report_batch_id, actor_role, from_status, to_status, owner, due_date, next_action, note
  ) values (
    new.id, new.created_by_role, null, new.lifecycle_status,
    new.owner, new.due_date, new.next_action, 'report batch created'
  );
  return new;
end;
$$;

drop trigger if exists record_initial_report_workflow_state on public.report_batches;
create trigger record_initial_report_workflow_state
after insert on public.report_batches
for each row execute function public.record_initial_report_workflow_state();

create or replace function public.assign_ticket_departments(
  p_ticket_id text,
  p_departments text[],
  p_reason text,
  p_actor_role text,
  p_manual_override boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
  v_departments text[];
  v_event_id bigint;
begin
  if p_actor_role not in ('admin', 'operator') then
    raise exception 'ไม่มีสิทธิ์จัดฝ่ายให้เรื่อง';
  end if;

  select array_agg(value order by first_position)
  into v_departments
  from (
    select btrim(value) as value, min(position) as first_position
    from unnest(coalesce(p_departments, '{}'::text[])) with ordinality as department(value, position)
    where btrim(value) <> ''
    group by btrim(value)
  ) as normalized;

  if coalesce(cardinality(v_departments), 0) = 0 then
    raise exception 'กรุณาเลือกฝ่ายอย่างน้อย 1 ฝ่าย';
  end if;

  if length(coalesce(nullif(btrim(p_reason), ''), '')) > 1000 then
    raise exception 'เหตุผลยาวเกิน 1,000 ตัวอักษร';
  end if;

  select * into v_ticket
  from public.tickets
  where ticket_id = p_ticket_id
  for update;

  if not found then
    raise exception 'ไม่พบเรื่องที่ต้องการจัดฝ่าย';
  end if;

  if coalesce(cardinality(v_ticket.dept_list), 0) > 0 then
    if not p_manual_override then
      raise exception 'เรื่องนี้มีฝ่ายแล้ว ต้องใช้ manual override';
    end if;
    if p_actor_role <> 'admin' then
      raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนฝ่ายเดิมได้';
    end if;
    if nullif(btrim(p_reason), '') is null then
      raise exception 'กรุณาระบุเหตุผลของ manual override';
    end if;
  elsif p_manual_override and p_actor_role <> 'admin' then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่ใช้ manual override ได้';
  end if;

  if coalesce(v_ticket.dept_list, '{}'::text[]) = v_departments then
    return jsonb_build_object('ticketId', v_ticket.ticket_id, 'departments', v_departments, 'idempotent', true);
  end if;

  update public.tickets
  set dept_list = v_departments
  where ticket_id = v_ticket.ticket_id;

  insert into public.ticket_assignment_events (
    ticket_id, actor_role, old_departments, new_departments, manual_override, reason
  ) values (
    v_ticket.ticket_id, p_actor_role, coalesce(v_ticket.dept_list, '{}'::text[]),
    v_departments, p_manual_override, nullif(btrim(p_reason), '')
  ) returning id into v_event_id;

  insert into public.ticket_history (ticket_id, changed_field, old_value, new_value)
  values (
    v_ticket.ticket_id,
    case when p_manual_override then 'department_override' else 'department_assignment' end,
    array_to_string(coalesce(v_ticket.dept_list, '{}'::text[]), ' | '),
    array_to_string(v_departments, ' | ')
  );

  insert into public.audit_events (actor_role, action, resource_type, resource_id, metadata)
  values (
    p_actor_role,
    case when p_manual_override then 'workflow.assignment.override' else 'workflow.assignment.assign' end,
    'ticket', v_ticket.ticket_id,
    jsonb_build_object('eventId', v_event_id, 'oldDepartments', coalesce(v_ticket.dept_list, '{}'::text[]), 'newDepartments', v_departments)
  );

  return jsonb_build_object('ticketId', v_ticket.ticket_id, 'departments', v_departments, 'eventId', v_event_id, 'idempotent', false);
end;
$$;

create or replace function public.transition_report_batch(
  p_batch_id uuid,
  p_to_status text,
  p_owner text,
  p_due_date date,
  p_next_action text,
  p_note text,
  p_actor_role text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.report_batches%rowtype;
  v_event_id bigint;
begin
  if p_actor_role not in ('admin', 'operator') then
    raise exception 'ไม่มีสิทธิ์เปลี่ยนสถานะรายงาน';
  end if;
  if p_to_status not in ('sent', 'partially_returned', 'complete', 'locked') then
    raise exception 'สถานะปลายทางไม่ถูกต้อง';
  end if;

  select * into v_batch from public.report_batches where id = p_batch_id for update;
  if not found then raise exception 'ไม่พบรอบรายงาน'; end if;
  if v_batch.lifecycle_status = 'locked' then raise exception 'รายงานนี้ถูกล็อกแล้ว'; end if;

  if not (
    (v_batch.lifecycle_status = 'draft' and p_to_status = 'sent') or
    (v_batch.lifecycle_status = 'sent' and p_to_status in ('partially_returned', 'complete')) or
    (v_batch.lifecycle_status = 'partially_returned' and p_to_status in ('sent', 'complete')) or
    (v_batch.lifecycle_status = 'complete' and p_to_status = 'locked')
  ) then
    raise exception 'ไม่สามารถเปลี่ยนสถานะจาก % เป็น % ได้', v_batch.lifecycle_status, p_to_status;
  end if;

  if p_to_status = 'locked' and p_actor_role <> 'admin' then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่ล็อกรายงานได้';
  end if;
  if p_to_status in ('sent', 'partially_returned') and nullif(btrim(coalesce(p_owner, v_batch.owner)), '') is null then
    raise exception 'กรุณาระบุเจ้าของรายงานก่อนส่ง';
  end if;
  if p_to_status in ('sent', 'partially_returned') and coalesce(p_due_date, v_batch.due_date) is null then
    raise exception 'กรุณาระบุกำหนดติดตามก่อนส่ง';
  end if;
  if p_to_status = 'partially_returned' and nullif(btrim(coalesce(p_next_action, v_batch.next_action)), '') is null then
    raise exception 'กรุณาระบุสิ่งที่ต้องทำต่อสำหรับรายงานที่ตีกลับบางส่วน';
  end if;
  if p_to_status = 'complete' and exists (
    select 1
    from public.report_batch_departments as department
    left join public.report_evidence_versions as version
      on version.id = department.current_evidence_version_id
      and version.report_batch_department_id = department.id
    where department.report_batch_id = p_batch_id
      and (version.id is null or version.review_status <> 'approved')
  ) then
    raise exception 'ยังมีฝ่ายที่หลักฐานไม่ผ่านการอนุมัติ จึงปิดรายงานไม่ได้';
  end if;

  update public.report_batches
  set lifecycle_status = p_to_status,
      owner = coalesce(nullif(btrim(p_owner), ''), owner),
      due_date = coalesce(p_due_date, due_date),
      next_action = nullif(btrim(p_next_action), ''),
      status_updated_at = now(),
      locked_at = case when p_to_status = 'locked' then now() else null end
  where id = p_batch_id;

  insert into public.report_workflow_events (
    report_batch_id, actor_role, from_status, to_status, owner, due_date, next_action, note
  ) values (
    p_batch_id, p_actor_role, v_batch.lifecycle_status, p_to_status,
    coalesce(nullif(btrim(p_owner), ''), v_batch.owner), coalesce(p_due_date, v_batch.due_date),
    nullif(btrim(p_next_action), ''), nullif(btrim(p_note), '')
  ) returning id into v_event_id;

  insert into public.audit_events (actor_role, action, resource_type, resource_id, metadata)
  values (p_actor_role, 'workflow.report.transition', 'report_batch', p_batch_id::text,
    jsonb_build_object('eventId', v_event_id, 'fromStatus', v_batch.lifecycle_status, 'toStatus', p_to_status));

  return jsonb_build_object('batchId', p_batch_id, 'status', p_to_status, 'eventId', v_event_id);
end;
$$;

create or replace function public.update_report_workflow_metadata(
  p_batch_id uuid,
  p_owner text,
  p_due_date date,
  p_next_action text,
  p_note text,
  p_actor_role text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch public.report_batches%rowtype;
  v_event_id bigint;
begin
  if p_actor_role not in ('admin', 'operator') then raise exception 'ไม่มีสิทธิ์แก้ไขผู้รับผิดชอบรายงาน'; end if;
  select * into v_batch from public.report_batches where id = p_batch_id for update;
  if not found then raise exception 'ไม่พบรอบรายงาน'; end if;
  if v_batch.lifecycle_status = 'locked' then raise exception 'รายงานนี้ถูกล็อกแล้ว'; end if;
  if nullif(btrim(p_owner), '') is null then raise exception 'กรุณาระบุเจ้าของรายงาน'; end if;

  update public.report_batches
  set owner = btrim(p_owner), due_date = p_due_date,
      next_action = nullif(btrim(p_next_action), ''), status_updated_at = now()
  where id = p_batch_id;

  insert into public.report_workflow_events (
    report_batch_id, actor_role, from_status, to_status, owner, due_date, next_action, note
  ) values (
    p_batch_id, p_actor_role, v_batch.lifecycle_status, v_batch.lifecycle_status,
    btrim(p_owner), p_due_date, nullif(btrim(p_next_action), ''), coalesce(nullif(btrim(p_note), ''), 'updated workflow metadata')
  ) returning id into v_event_id;

  insert into public.audit_events (actor_role, action, resource_type, resource_id, metadata)
  values (p_actor_role, 'workflow.report.metadata', 'report_batch', p_batch_id::text,
    jsonb_build_object('eventId', v_event_id, 'status', v_batch.lifecycle_status));

  return jsonb_build_object('batchId', p_batch_id, 'status', v_batch.lifecycle_status, 'eventId', v_event_id);
end;
$$;

-- Gate the normal report-creation RPC until every pending ticket has an
-- assignment. Keep the historical item tables free of current-ticket triggers:
-- restore must be able to replay an old snapshot even when today's assignment
-- has since changed.
alter function public.create_report_batch_snapshot(date, text, uuid)
  rename to create_report_batch_snapshot_without_triage_gate;

revoke execute on function public.create_report_batch_snapshot_without_triage_gate(date, text, uuid)
from public, anon, authenticated, service_role;

create or replace function public.create_report_batch_snapshot(
  p_report_date date,
  p_note text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_unassigned_count integer;
begin
  select count(*)::integer into v_unassigned_count
  from public.tickets as ticket
  where (ticket.state is null or ticket.state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)'))
    and coalesce(cardinality(ticket.dept_list), 0) = 0;

  if v_unassigned_count > 0 then
    raise exception 'ยังมีเรื่องรอจัดฝ่าย % เรื่อง กรุณาปิดคิว Triage ก่อนสร้างรอบรายงาน', v_unassigned_count;
  end if;

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

create or replace function public.workflow_action_center(p_today date default current_date)
returns table (
  item_type text, resource_id text, title text, detail text, workflow_status text,
  owner text, due_date date, is_overdue boolean, priority integer, href text, created_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  select * from (
    select
      'triage'::text, ticket.ticket_id, 'จัดฝ่ายให้เรื่อง ' || ticket.ticket_id,
      coalesce(nullif(ticket.comment, ''), nullif(ticket.address, ''), 'เรื่องรอจัดฝ่าย'),
      'unassigned'::text, null::text, null::date, false, 10,
      '/cases/' || ticket.ticket_id, coalesce(ticket.first_seen_at, ticket.updated_at)
    from public.tickets as ticket
    where (ticket.state is null or ticket.state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)'))
      and coalesce(cardinality(ticket.dept_list), 0) = 0

    union all

    select
      'report'::text, batch.id::text, 'ติดตามรอบรายงาน ' || to_char(batch.report_date, 'DD/MM/YYYY'),
      coalesce(nullif(batch.next_action, ''), 'กำหนดเจ้าของและสิ่งที่ต้องทำต่อ'),
      batch.lifecycle_status, batch.owner, batch.due_date,
      batch.due_date < p_today,
      case when batch.due_date < p_today then 1 when batch.due_date = p_today then 2 else 20 end,
      '/report/' || batch.id::text, batch.created_at
    from public.report_batches as batch
    where batch.lifecycle_status <> 'locked'
      and (batch.due_date <= p_today or batch.owner is null or batch.next_action is null)
  ) as action_items(
    item_type, resource_id, title, detail, workflow_status,
    owner, due_date, is_overdue, priority, href, created_at
  )
  order by action_items.priority asc, action_items.due_date asc nulls last,
    action_items.created_at asc, action_items.resource_id asc
  limit 100;
$$;

alter table public.ticket_assignment_events enable row level security;
alter table public.report_workflow_events enable row level security;
revoke all on public.ticket_assignment_events, public.report_workflow_events from public, anon, authenticated;
grant select on public.ticket_assignment_events, public.report_workflow_events to service_role;
grant usage, select on sequence public.ticket_assignment_events_id_seq, public.report_workflow_events_id_seq to service_role;

revoke execute on function public.assign_ticket_departments(text, text[], text, text, boolean) from public, anon, authenticated;
revoke execute on function public.transition_report_batch(uuid, text, text, date, text, text, text) from public, anon, authenticated;
revoke execute on function public.update_report_workflow_metadata(uuid, text, date, text, text, text) from public, anon, authenticated;
revoke execute on function public.workflow_action_center(date) from public, anon, authenticated;
grant execute on function public.assign_ticket_departments(text, text[], text, text, boolean) to service_role;
grant execute on function public.transition_report_batch(uuid, text, text, date, text, text, text) to service_role;
grant execute on function public.update_report_workflow_metadata(uuid, text, date, text, text, text) to service_role;
grant execute on function public.workflow_action_center(date) to service_role;

commit;
