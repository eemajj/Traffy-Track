begin;

-- Pipeline V2 keeps large JSON parsing and the final CityData merge in separate
-- transactions. Rows can be staged repeatedly; only the final RPC mutates the
-- canonical ticket and history tables.
alter table public.import_batches
  add column if not exists pipeline_version smallint not null default 1,
  add column if not exists source_storage_path_v2 text,
  add column if not exists processing_phase text;

alter table public.import_batches
  drop constraint if exists import_batches_pipeline_version_check,
  drop constraint if exists import_batches_processing_phase_check,
  add constraint import_batches_pipeline_version_check check (pipeline_version in (1, 2)),
  add constraint import_batches_processing_phase_check check (
    (pipeline_version = 1 and processing_phase is null)
    or (pipeline_version = 2 and processing_phase in ('staging', 'finalizing'))
  );

create unique index if not exists idx_import_batches_source_storage_path_v2
  on public.import_batches (source_storage_path_v2)
  where source_storage_path_v2 is not null;

create index if not exists idx_import_batches_v2_claim
  on public.import_batches (next_attempt_at, imported_at)
  where status = 'queued'
    and pipeline_version = 2
    and source_storage_path_v2 is not null;

create table if not exists public.import_ticket_stage (
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  ticket_id text not null,
  type text,
  comment text,
  photo_url text,
  address text,
  subdistrict text,
  district text,
  province text,
  timestamp timestamptz,
  last_activity timestamptz,
  state text,
  org_response text,
  org_list text[] not null default '{}',
  dept_list text[] not null default '{}',
  star integer,
  hashtag text,
  lat numeric,
  lng numeric,
  primary key (import_batch_id, ticket_id)
);

create table if not exists public.import_history_stage (
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  ticket_id text not null,
  changed_field text not null,
  old_value text,
  new_value text,
  primary key (import_batch_id, ticket_id, changed_field)
);

alter table public.import_ticket_stage enable row level security;
alter table public.import_history_stage enable row level security;
revoke all on table public.import_ticket_stage from public, anon, authenticated;
revoke all on table public.import_history_stage from public, anon, authenticated;
grant select, insert, update, delete on table public.import_ticket_stage to service_role;
grant select, insert, update, delete on table public.import_history_stage to service_role;

create or replace function public.claim_import_batches_v2(
  p_limit integer default 1,
  p_lease_seconds integer default 120
)
returns table (
  id uuid,
  filename text,
  storage_path text,
  lease_token uuid,
  attempt_count integer,
  locked_until timestamptz,
  processing_phase text
)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  if p_limit < 1 or p_limit > 10 then
    raise exception 'p_limit must be between 1 and 10';
  end if;
  if p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'p_lease_seconds must be between 60 and 3600';
  end if;

  update public.import_batches as batch
  set
    status = case when batch.attempt_count >= batch.max_attempts then 'failed' else 'queued' end,
    error_message = case
      when batch.attempt_count >= batch.max_attempts
        then coalesce(batch.error_message, 'งานนำเข้า V2 สูญเสีย lease') || ' (ครบจำนวน retry แล้ว)'
      else coalesce(batch.error_message, 'งานนำเข้า V2 สูญเสีย lease และรอ retry')
    end,
    completed_at = case when batch.attempt_count >= batch.max_attempts then now() else null end,
    lease_token = null,
    locked_until = null,
    heartbeat_at = null,
    next_attempt_at = case
      when batch.attempt_count >= batch.max_attempts then batch.next_attempt_at
      else now() + make_interval(secs => least(900, 15 * power(2, greatest(batch.attempt_count - 1, 0))::integer))
    end
  where batch.status = 'running'
    and batch.pipeline_version = 2
    and batch.source_storage_path_v2 is not null
    and batch.lease_token is not null
    and batch.locked_until < now();

  delete from public.import_history_stage as stage
  using public.import_batches as batch
  where stage.import_batch_id = batch.id
    and batch.pipeline_version = 2 and batch.status = 'failed';
  delete from public.import_ticket_stage as stage
  using public.import_batches as batch
  where stage.import_batch_id = batch.id
    and batch.pipeline_version = 2 and batch.status = 'failed';

  return query
  with candidates as (
    select batch.id
    from public.import_batches as batch
    where batch.status = 'queued'
      and batch.pipeline_version = 2
      and batch.source_storage_path_v2 is not null
      and batch.next_attempt_at <= now()
      and batch.attempt_count < batch.max_attempts
    order by batch.next_attempt_at, batch.imported_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.import_batches as batch
    set
      status = 'running',
      attempt_count = batch.attempt_count + 1,
      lease_token = gen_random_uuid(),
      locked_until = now() + make_interval(secs => p_lease_seconds),
      heartbeat_at = now(),
      completed_at = null
    from candidates
    where batch.id = candidates.id
    returning batch.id, batch.filename, batch.source_storage_path_v2,
      batch.lease_token, batch.attempt_count, batch.locked_until,
      batch.processing_phase
  )
  select claimed.id, claimed.filename, claimed.source_storage_path_v2,
    claimed.lease_token, claimed.attempt_count, claimed.locked_until,
    claimed.processing_phase
  from claimed;
end;
$$;

create or replace function public.reset_claimed_import_stage_v2(
  p_import_batch_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 120
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1 from public.import_batches
  where id = p_import_batch_id and status = 'running'
    and pipeline_version = 2 and processing_phase = 'staging'
    and lease_token = p_lease_token and locked_until >= now()
  for update;
  if not found then raise exception 'Import batch % lease is no longer valid', p_import_batch_id; end if;

  delete from public.import_history_stage where import_batch_id = p_import_batch_id;
  delete from public.import_ticket_stage where import_batch_id = p_import_batch_id;
  update public.import_batches set heartbeat_at = now(),
    locked_until = now() + make_interval(secs => p_lease_seconds)
  where id = p_import_batch_id;
end;
$$;

create or replace function public.release_import_batch_claim_v2(
  p_import_batch_id uuid,
  p_lease_token uuid,
  p_error_message text,
  p_retryable boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform 1 from public.import_batches
  where id = p_import_batch_id and pipeline_version = 2
    and status = 'running' and lease_token = p_lease_token
  for update;
  if not found then return jsonb_build_object('released', false, 'reason', 'lease_lost'); end if;

  v_result := public.release_import_batch_claim(
    p_import_batch_id, p_lease_token, p_error_message, p_retryable
  );
  if v_result ->> 'status' = 'failed' then
    delete from public.import_history_stage where import_batch_id = p_import_batch_id;
    delete from public.import_ticket_stage where import_batch_id = p_import_batch_id;
  end if;
  return v_result;
end;
$$;

create or replace function public.stage_claimed_import_rows_v2(
  p_import_batch_id uuid,
  p_lease_token uuid,
  p_tickets jsonb default '[]'::jsonb,
  p_history jsonb default '[]'::jsonb,
  p_lease_seconds integer default 120
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ticket_count integer;
  v_history_count integer;
begin
  perform 1 from public.import_batches
  where id = p_import_batch_id and status = 'running'
    and pipeline_version = 2 and processing_phase = 'staging'
    and lease_token = p_lease_token and locked_until >= now()
  for update;
  if not found then raise exception 'Import batch % lease is no longer valid', p_import_batch_id; end if;

  insert into public.import_ticket_stage (
    import_batch_id, ticket_id, type, comment, photo_url, address,
    subdistrict, district, province, timestamp, last_activity, state,
    org_response, org_list, dept_list, star, hashtag, lat, lng
  )
  select p_import_batch_id, rows.ticket_id, rows.type, rows.comment,
    rows.photo_url, rows.address, rows.subdistrict, rows.district,
    rows.province, rows.timestamp, rows.last_activity, rows.state,
    rows.org_response, coalesce(rows.org_list, '{}'), coalesce(rows.dept_list, '{}'),
    rows.star, rows.hashtag, rows.lat, rows.lng
  from jsonb_to_recordset(coalesce(p_tickets, '[]'::jsonb)) as rows(
    ticket_id text, type text, comment text, photo_url text, address text,
    subdistrict text, district text, province text, timestamp timestamptz,
    last_activity timestamptz, state text, org_response text, org_list text[],
    dept_list text[], star integer, hashtag text, lat numeric, lng numeric
  )
  on conflict (import_batch_id, ticket_id) do update set
    type = excluded.type, comment = excluded.comment, photo_url = excluded.photo_url,
    address = excluded.address, subdistrict = excluded.subdistrict,
    district = excluded.district, province = excluded.province,
    timestamp = excluded.timestamp, last_activity = excluded.last_activity,
    state = excluded.state, org_response = excluded.org_response,
    org_list = excluded.org_list, dept_list = excluded.dept_list,
    star = excluded.star, hashtag = excluded.hashtag, lat = excluded.lat, lng = excluded.lng;

  insert into public.import_history_stage (
    import_batch_id, ticket_id, changed_field, old_value, new_value
  )
  select p_import_batch_id, rows.ticket_id, rows.changed_field,
    rows.old_value, rows.new_value
  from jsonb_to_recordset(coalesce(p_history, '[]'::jsonb)) as rows(
    ticket_id text, changed_field text, old_value text, new_value text
  )
  on conflict (import_batch_id, ticket_id, changed_field) do update set
    old_value = excluded.old_value, new_value = excluded.new_value;

  update public.import_batches set heartbeat_at = now(),
    locked_until = now() + make_interval(secs => p_lease_seconds)
  where id = p_import_batch_id;
  select count(*)::integer into v_ticket_count from public.import_ticket_stage where import_batch_id = p_import_batch_id;
  select count(*)::integer into v_history_count from public.import_history_stage where import_batch_id = p_import_batch_id;
  return jsonb_build_object('stagedTickets', v_ticket_count, 'stagedHistory', v_history_count);
end;
$$;

create or replace function public.continue_claimed_import_batch_v2(
  p_import_batch_id uuid,
  p_lease_token uuid,
  p_total_rows integer,
  p_processed_rows integer,
  p_duplicate_rows integer,
  p_new_tickets integer,
  p_reopened_tickets integer,
  p_changed_tickets integer,
  p_unchanged_tickets integer,
  p_changed_fields integer,
  p_expected_tickets integer,
  p_expected_history integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ticket_count integer;
  v_history_count integer;
begin
  perform 1 from public.import_batches
  where id = p_import_batch_id and status = 'running'
    and pipeline_version = 2 and processing_phase = 'staging'
    and lease_token = p_lease_token and locked_until >= now()
  for update;
  if not found then raise exception 'Import batch % lease is no longer valid', p_import_batch_id; end if;

  select count(*)::integer into v_ticket_count from public.import_ticket_stage where import_batch_id = p_import_batch_id;
  select count(*)::integer into v_history_count from public.import_history_stage where import_batch_id = p_import_batch_id;
  if v_ticket_count <> p_expected_tickets or v_history_count <> p_expected_history then
    raise exception 'Import batch % stage count mismatch: tickets %/%, history %/%',
      p_import_batch_id, v_ticket_count, p_expected_tickets, v_history_count, p_expected_history;
  end if;

  update public.import_batches set
    total_rows = p_total_rows, processed_rows = p_processed_rows,
    duplicate_rows = p_duplicate_rows, new_tickets = p_new_tickets,
    reopened_tickets = p_reopened_tickets, changed_tickets = p_changed_tickets,
    unchanged_tickets = p_unchanged_tickets, changed_fields = p_changed_fields,
    processing_phase = 'finalizing', status = 'queued', error_message = null,
    completed_at = null, lease_token = null, locked_until = null,
    heartbeat_at = now(), next_attempt_at = now(),
    attempt_count = greatest(attempt_count - 1, 0)
  where id = p_import_batch_id;
end;
$$;

create or replace function public.finalize_staged_import_batch_v2(
  p_import_batch_id uuid,
  p_lease_token uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected_tickets integer;
  v_expected_history integer;
  v_staged_tickets integer;
  v_staged_history integer;
begin
  select new_tickets + changed_tickets, new_tickets + changed_fields
    into v_expected_tickets, v_expected_history
  from public.import_batches
  where id = p_import_batch_id and status = 'running'
    and pipeline_version = 2 and processing_phase = 'finalizing'
    and lease_token = p_lease_token and locked_until >= now()
  for update;
  if not found then raise exception 'Import batch % lease is no longer valid', p_import_batch_id; end if;

  select count(*)::integer into v_staged_tickets
    from public.import_ticket_stage where import_batch_id = p_import_batch_id;
  select count(*)::integer into v_staged_history
    from public.import_history_stage where import_batch_id = p_import_batch_id;
  if v_staged_tickets <> v_expected_tickets or v_staged_history <> v_expected_history then
    raise exception 'Import batch % final stage count mismatch: tickets %/%, history %/%',
      p_import_batch_id, v_staged_tickets, v_expected_tickets,
      v_staged_history, v_expected_history;
  end if;

  insert into public.tickets (
    ticket_id, type, comment, photo_url, address, subdistrict, district,
    province, timestamp, last_activity, state, org_response, org_list,
    dept_list, star, hashtag, lat, lng
  )
  select ticket_id, type, comment, photo_url, address, subdistrict, district,
    province, timestamp, last_activity, state, org_response, org_list,
    dept_list, star, hashtag, lat, lng
  from public.import_ticket_stage where import_batch_id = p_import_batch_id
  on conflict (ticket_id) do update set
    type = excluded.type, comment = excluded.comment, photo_url = excluded.photo_url,
    address = excluded.address, subdistrict = excluded.subdistrict,
    district = excluded.district, province = excluded.province,
    timestamp = excluded.timestamp, last_activity = excluded.last_activity,
    state = excluded.state, org_response = excluded.org_response,
    org_list = excluded.org_list, dept_list = excluded.dept_list,
    star = excluded.star, hashtag = excluded.hashtag, lat = excluded.lat, lng = excluded.lng;

  insert into public.ticket_history (
    ticket_id, changed_field, old_value, new_value, import_batch_id
  )
  select ticket_id, changed_field, old_value, new_value, import_batch_id
  from public.import_history_stage where import_batch_id = p_import_batch_id;

  update public.import_batches set status = 'completed', error_message = null,
    completed_at = now(), lease_token = null, locked_until = null, heartbeat_at = now()
  where id = p_import_batch_id;
  delete from public.import_history_stage where import_batch_id = p_import_batch_id;
  delete from public.import_ticket_stage where import_batch_id = p_import_batch_id;
end;
$$;

alter function public.finalize_staged_import_batch_v2(uuid, uuid)
  set statement_timeout = '45s';

-- The legacy maintenance RPC treated every row with storage_path IS NULL as
-- an inline import. V2 deliberately keeps that legacy column NULL so old
-- workers cannot claim it, therefore recovery must identify inline V1 rows by
-- pipeline_version instead of storage_path alone.
create or replace function public.recover_stale_import_jobs()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_retried integer := 0;
  v_failed integer := 0;
  v_retried_ids uuid[] := '{}'::uuid[];
  v_failed_ids uuid[] := '{}'::uuid[];
begin
  with recovered as (
    update public.import_batches as batch
    set status = 'queued',
      error_message = 'งานนำเข้าสูญเสีย lease และถูกนำกลับเข้าคิว',
      completed_at = null, lease_token = null, locked_until = null,
      heartbeat_at = null, next_attempt_at = now()
    where batch.status = 'running'
      and (
        (batch.pipeline_version = 1 and batch.storage_path is not null)
        or (batch.pipeline_version = 2 and batch.source_storage_path_v2 is not null)
      )
      and batch.lease_token is not null and batch.locked_until < now()
      and batch.attempt_count < batch.max_attempts
    returning batch.id
  )
  select count(*)::integer, coalesce(array_agg(id), '{}'::uuid[])
    into v_retried, v_retried_ids from recovered;

  with closed as (
    update public.import_batches as batch
    set status = 'failed',
      error_message = case
        when batch.pipeline_version = 2 then 'งานนำเข้า V2 สูญเสีย lease และ retry ครบแล้ว'
        when batch.storage_path is not null then 'งานนำเข้าสูญเสีย lease และ retry ครบแล้ว'
        else 'งานนำเข้าไม่มี heartbeat เกิน 2 ชั่วโมงและถูกปิดอัตโนมัติ'
      end,
      completed_at = now(), lease_token = null, locked_until = null
    where (
      batch.status = 'running'
      and (
        (batch.pipeline_version = 1 and batch.storage_path is not null)
        or (batch.pipeline_version = 2 and batch.source_storage_path_v2 is not null)
      )
      and batch.lease_token is not null and batch.locked_until < now()
      and batch.attempt_count >= batch.max_attempts
    ) or (
      batch.pipeline_version = 1 and batch.storage_path is null
      and (
        (batch.status = 'queued' and batch.imported_at < now() - interval '2 hours')
        or (batch.status = 'running' and coalesce(batch.heartbeat_at, batch.imported_at) < now() - interval '2 hours')
      )
    )
    returning batch.id
  )
  select count(*)::integer, coalesce(array_agg(id), '{}'::uuid[])
    into v_failed, v_failed_ids from closed;

  delete from public.import_history_stage as stage
  where stage.import_batch_id = any(v_failed_ids);
  delete from public.import_ticket_stage as stage
  where stage.import_batch_id = any(v_failed_ids);

  insert into public.audit_events (
    actor_role, action, resource_type, resource_id, outcome, metadata
  )
  select 'system', 'import.stale_recovered', 'import_batch', recovered.id::text,
    'failure', jsonb_build_object(
      'result', case when recovered.id = any(v_retried_ids) then 'queued' else 'failed' end,
      'recoverySource', 'maintenance'
    )
  from unnest(v_retried_ids || v_failed_ids) as recovered(id);

  return jsonb_build_object('recovered', v_retried + v_failed,
    'retried', v_retried, 'failed', v_failed,
    'importBatchIds', to_jsonb(v_retried_ids || v_failed_ids));
end;
$$;

revoke execute on function public.claim_import_batches_v2(integer, integer) from public, anon, authenticated;
revoke execute on function public.reset_claimed_import_stage_v2(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.stage_claimed_import_rows_v2(uuid, uuid, jsonb, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.continue_claimed_import_batch_v2(uuid, uuid, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.finalize_staged_import_batch_v2(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.release_import_batch_claim_v2(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_import_batches_v2(integer, integer) to service_role;
grant execute on function public.reset_claimed_import_stage_v2(uuid, uuid, integer) to service_role;
grant execute on function public.stage_claimed_import_rows_v2(uuid, uuid, jsonb, jsonb, integer) to service_role;
grant execute on function public.continue_claimed_import_batch_v2(uuid, uuid, integer, integer, integer, integer, integer, integer, integer, integer, integer, integer) to service_role;
grant execute on function public.finalize_staged_import_batch_v2(uuid, uuid) to service_role;
grant execute on function public.release_import_batch_claim_v2(uuid, uuid, text, boolean) to service_role;

commit;
