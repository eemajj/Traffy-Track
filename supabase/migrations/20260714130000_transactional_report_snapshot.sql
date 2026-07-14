begin;

alter table public.report_batches
  add column if not exists snapshot_captured_at timestamptz,
  add column if not exists source_import_batch_id uuid references public.import_batches(id) on delete set null,
  add column if not exists source_import_completed_at timestamptz,
  add column if not exists idempotency_key uuid;

update public.report_batches
set
  snapshot_captured_at = coalesce(snapshot_captured_at, created_at),
  idempotency_key = coalesce(idempotency_key, gen_random_uuid())
where snapshot_captured_at is null
   or idempotency_key is null;

alter table public.report_batches
  alter column snapshot_captured_at set default now(),
  alter column snapshot_captured_at set not null,
  alter column idempotency_key set not null;

create unique index if not exists idx_report_batches_idempotency_key
  on public.report_batches (idempotency_key);

create unique index if not exists idx_report_batch_items_unique_ticket_per_department
  on public.report_batch_items (report_batch_id, dept_name, ticket_id);

alter table public.report_batch_items
  drop constraint if exists report_batch_items_department_fk;

alter table public.report_batch_items
  add constraint report_batch_items_department_fk
  foreign key (report_batch_id, dept_name)
  references public.report_batch_departments (report_batch_id, dept_name)
  on delete cascade;

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
declare
  v_batch_id uuid;
  v_snapshot_at timestamptz := now();
  v_source_import_batch_id uuid;
  v_source_import_completed_at timestamptz;
  v_item_count integer;
begin
  if p_report_date is null then
    raise exception 'กรุณาระบุวันที่ของรอบรายงาน';
  end if;

  if p_idempotency_key is null then
    raise exception 'ไม่พบรหัสป้องกันการสร้างรอบรายงานซ้ำ';
  end if;

  -- Serialize retries carrying the same key, then return the first completed
  -- result instead of creating a duplicate report batch.
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

  select id into v_batch_id
  from public.report_batches
  where idempotency_key = p_idempotency_key;

  if v_batch_id is not null then
    return v_batch_id;
  end if;

  if exists (
    select 1
    from public.import_batches
    where status in ('queued', 'running')
  ) then
    raise exception 'ยังมีงานนำเข้าที่กำลังประมวลผล กรุณารอให้งานเสร็จก่อนสร้างรอบรายงาน';
  end if;

  -- Prevent ticket upserts from changing the source set between the department
  -- and item inserts. Import writes resume automatically after this transaction.
  lock table public.tickets in share mode;

  select batch.id, coalesce(batch.completed_at, batch.imported_at)
  into v_source_import_batch_id, v_source_import_completed_at
  from public.import_batches as batch
  where batch.status = 'completed'
  order by batch.completed_at desc nulls last, batch.imported_at desc, batch.id desc
  limit 1;

  insert into public.report_batches (
    report_date,
    note,
    snapshot_captured_at,
    source_import_batch_id,
    source_import_completed_at,
    idempotency_key
  )
  values (
    p_report_date,
    nullif(btrim(p_note), ''),
    v_snapshot_at,
    v_source_import_batch_id,
    v_source_import_completed_at,
    p_idempotency_key
  )
  returning id into v_batch_id;

  insert into public.report_batch_departments (report_batch_id, dept_name)
  select v_batch_id, departments.dept_name
  from (
    select distinct btrim(department.value) as dept_name
    from public.tickets as ticket
    cross join lateral unnest(coalesce(ticket.dept_list, '{}'::text[])) as department(value)
    where (ticket.state is null or ticket.state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)'))
      and btrim(department.value) <> ''
  ) as departments
  order by departments.dept_name;

  insert into public.report_batch_items (
    report_batch_id,
    dept_name,
    ticket_id,
    snapshot_captured_at,
    snapshot_type,
    snapshot_comment,
    snapshot_address,
    snapshot_subdistrict,
    snapshot_timestamp,
    snapshot_last_activity,
    snapshot_state,
    snapshot_org_response
  )
  select
    v_batch_id,
    department.dept_name,
    ticket.ticket_id,
    v_snapshot_at,
    ticket.type,
    ticket.comment,
    ticket.address,
    ticket.subdistrict,
    ticket.timestamp,
    ticket.last_activity,
    ticket.state,
    ticket.org_response
  from public.tickets as ticket
  cross join lateral (
    select distinct btrim(value) as dept_name
    from unnest(coalesce(ticket.dept_list, '{}'::text[])) as values(value)
    where btrim(value) <> ''
  ) as department
  where ticket.state is null
     or ticket.state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)')
  order by department.dept_name, ticket.ticket_id;

  get diagnostics v_item_count = row_count;

  if v_item_count = 0 then
    raise exception 'ยังไม่มีเรื่องคงค้างที่ระบุฝ่ายแล้วสำหรับสร้างรอบรายงาน';
  end if;

  return v_batch_id;
end;
$$;

revoke execute on function public.create_report_batch_snapshot(date, text, uuid)
from public, anon, authenticated;

grant execute on function public.create_report_batch_snapshot(date, text, uuid)
to service_role;

commit;
