begin;

-- Turn import_batches into the durable queue instead of introducing a second
-- job table. Existing synchronous imports keep working because every new
-- column is nullable or has a backward-compatible default.
alter table public.import_batches
  add column if not exists storage_path text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists lease_token uuid,
  add column if not exists locked_until timestamptz,
  add column if not exists next_attempt_at timestamptz not null default now();

alter table public.import_batches
  drop constraint if exists import_batches_attempt_count_check,
  drop constraint if exists import_batches_max_attempts_check,
  add constraint import_batches_attempt_count_check check (attempt_count >= 0),
  add constraint import_batches_max_attempts_check check (max_attempts between 1 and 20);

create index if not exists idx_import_batches_durable_claim
  on public.import_batches (next_attempt_at, imported_at)
  where status = 'queued' and storage_path is not null;

-- Retried HTTP enqueue requests for the same uploaded object resolve to the
-- original batch instead of creating a second logical import.
create unique index if not exists idx_import_batches_storage_path
  on public.import_batches (storage_path)
  where storage_path is not null;

create index if not exists idx_import_batches_expired_lease
  on public.import_batches (locked_until)
  where status = 'running' and lease_token is not null;

create or replace function public.claim_import_batches(
  p_limit integer default 1,
  p_lease_seconds integer default 900
)
returns table (
  id uuid,
  filename text,
  storage_path text,
  lease_token uuid,
  attempt_count integer,
  locked_until timestamptz
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

  -- A dead worker cannot retain ownership forever. Requeue retryable leases and
  -- terminally fail exhausted jobs before selecting new work.
  with exhausted as (
    update public.import_batches as batch
    set
      status = 'failed',
      error_message = coalesce(batch.error_message, 'งานนำเข้าสูญเสีย lease')
        || ' (ครบจำนวน retry แล้ว)',
      completed_at = now(),
      lease_token = null,
      locked_until = null,
      heartbeat_at = null
    where batch.status = 'running'
      and batch.storage_path is not null
      and batch.lease_token is not null
      and batch.locked_until < now()
      and batch.attempt_count >= batch.max_attempts
    returning batch.id, batch.filename, batch.attempt_count
  )
  insert into public.audit_events (
    actor_role, action, resource_type, resource_id, outcome, metadata
  )
  select
    'system',
    'import.stale_recovered',
    'import_batch',
    exhausted.id::text,
    'failure',
    jsonb_build_object(
      'filename', exhausted.filename,
      'result', 'failed',
      'attemptCount', exhausted.attempt_count
    )
  from exhausted;

  with retryable as (
    update public.import_batches as batch
    set
      status = 'queued',
      error_message = coalesce(batch.error_message, 'งานนำเข้าสูญเสีย lease และรอ retry'),
      completed_at = null,
      lease_token = null,
      locked_until = null,
      heartbeat_at = null,
      next_attempt_at = now()
        + make_interval(secs => least(900, 15 * power(2, greatest(batch.attempt_count - 1, 0))::integer))
    where batch.status = 'running'
      and batch.storage_path is not null
      and batch.lease_token is not null
      and batch.locked_until < now()
      and batch.attempt_count < batch.max_attempts
    returning batch.id, batch.filename, batch.attempt_count
  )
  insert into public.audit_events (
    actor_role, action, resource_type, resource_id, outcome, metadata
  )
  select
    'system',
    'import.stale_recovered',
    'import_batch',
    retryable.id::text,
    'failure',
    jsonb_build_object(
      'filename', retryable.filename,
      'result', 'queued',
      'attemptCount', retryable.attempt_count
    )
  from retryable;

  return query
  with candidates as (
    select batch.id
    from public.import_batches as batch
    where batch.status = 'queued'
      and batch.storage_path is not null
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
      error_message = null,
      completed_at = null
    from candidates
    where batch.id = candidates.id
    returning
      batch.id,
      batch.filename,
      batch.storage_path,
      batch.lease_token,
      batch.attempt_count,
      batch.locked_until
  )
  select
    claimed.id,
    claimed.filename,
    claimed.storage_path,
    claimed.lease_token,
    claimed.attempt_count,
    claimed.locked_until
  from claimed;
end;
$$;

create or replace function public.heartbeat_claimed_import_batch(
  p_import_batch_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 900
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_lease_seconds < 60 or p_lease_seconds > 3600 then
    raise exception 'p_lease_seconds must be between 60 and 3600';
  end if;

  update public.import_batches
  set
    heartbeat_at = now(),
    locked_until = now() + make_interval(secs => p_lease_seconds)
  where id = p_import_batch_id
    and status = 'running'
    and lease_token = p_lease_token
    and locked_until >= now();

  return found;
end;
$$;

-- The final write verifies the lease in the same transaction as ticket/history
-- mutations, making a late worker harmless after its lease has been reclaimed.
create or replace function public.apply_claimed_import_batch(
  p_import_batch_id uuid,
  p_lease_token uuid,
  p_tickets jsonb,
  p_history jsonb,
  p_total_rows integer,
  p_processed_rows integer,
  p_duplicate_rows integer,
  p_new_tickets integer,
  p_reopened_tickets integer,
  p_changed_tickets integer,
  p_unchanged_tickets integer,
  p_changed_fields integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1
  from public.import_batches
  where id = p_import_batch_id
    and status = 'running'
    and lease_token = p_lease_token
    and locked_until >= now()
  for update;

  if not found then
    raise exception 'Import batch % lease is no longer valid', p_import_batch_id;
  end if;

  insert into public.tickets (
    ticket_id, type, comment, photo_url, address, subdistrict, district,
    province, timestamp, last_activity, state, org_response, org_list,
    dept_list, star, hashtag, lat, lng
  )
  select
    ticket_id, type, comment, photo_url, address, subdistrict, district,
    province, timestamp, last_activity, state, org_response, org_list,
    dept_list, star, hashtag, lat, lng
  from jsonb_to_recordset(coalesce(p_tickets, '[]'::jsonb)) as rows(
    ticket_id text, type text, comment text, photo_url text, address text,
    subdistrict text, district text, province text, timestamp timestamptz,
    last_activity timestamptz, state text, org_response text, org_list text[],
    dept_list text[], star integer, hashtag text, lat numeric, lng numeric
  )
  on conflict (ticket_id) do update set
    type = excluded.type,
    comment = excluded.comment,
    photo_url = excluded.photo_url,
    address = excluded.address,
    subdistrict = excluded.subdistrict,
    district = excluded.district,
    province = excluded.province,
    timestamp = excluded.timestamp,
    last_activity = excluded.last_activity,
    state = excluded.state,
    org_response = excluded.org_response,
    org_list = excluded.org_list,
    dept_list = excluded.dept_list,
    star = excluded.star,
    hashtag = excluded.hashtag,
    lat = excluded.lat,
    lng = excluded.lng;

  insert into public.ticket_history (
    ticket_id, changed_field, old_value, new_value, import_batch_id
  )
  select ticket_id, changed_field, old_value, new_value, import_batch_id
  from jsonb_to_recordset(coalesce(p_history, '[]'::jsonb)) as rows(
    ticket_id text,
    changed_field text,
    old_value text,
    new_value text,
    import_batch_id uuid
  );

  update public.import_batches
  set
    total_rows = p_total_rows,
    processed_rows = p_processed_rows,
    duplicate_rows = p_duplicate_rows,
    new_tickets = p_new_tickets,
    reopened_tickets = p_reopened_tickets,
    changed_tickets = p_changed_tickets,
    unchanged_tickets = p_unchanged_tickets,
    changed_fields = p_changed_fields,
    status = 'completed',
    error_message = null,
    completed_at = now(),
    lease_token = null,
    locked_until = null,
    heartbeat_at = now()
  where id = p_import_batch_id;
end;
$$;

create or replace function public.release_import_batch_claim(
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
  v_batch public.import_batches%rowtype;
  v_retry boolean;
  v_delay_seconds integer;
begin
  select * into v_batch
  from public.import_batches
  where id = p_import_batch_id
    and status = 'running'
    and lease_token = p_lease_token
  for update;

  if not found then
    return jsonb_build_object('released', false, 'reason', 'lease_lost');
  end if;

  v_retry := p_retryable and v_batch.attempt_count < v_batch.max_attempts;
  v_delay_seconds := least(900, 15 * power(2, greatest(v_batch.attempt_count - 1, 0))::integer);

  update public.import_batches
  set
    status = case when v_retry then 'queued' else 'failed' end,
    error_message = left(coalesce(nullif(p_error_message, ''), 'นำเข้าข้อมูลไม่สำเร็จ'), 2000),
    completed_at = case when v_retry then null else now() end,
    lease_token = null,
    locked_until = null,
    heartbeat_at = null,
    next_attempt_at = case
      when v_retry then now() + make_interval(secs => v_delay_seconds)
      else next_attempt_at
    end
  where id = p_import_batch_id;

  return jsonb_build_object(
    'released', true,
    'status', case when v_retry then 'queued' else 'failed' end,
    'attemptCount', v_batch.attempt_count,
    'maxAttempts', v_batch.max_attempts,
    'retryAfterSeconds', case when v_retry then v_delay_seconds else null end
  );
end;
$$;

-- Keep the maintenance entry point compatible while teaching it lease-aware
-- recovery. Durable jobs are retried; pre-migration/inline jobs retain the old
-- terminal stale behavior.
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
    set
      status = 'queued',
      error_message = 'งานนำเข้าสูญเสีย lease และถูกนำกลับเข้าคิว',
      completed_at = null,
      lease_token = null,
      locked_until = null,
      heartbeat_at = null,
      next_attempt_at = now()
    where batch.status = 'running'
      and batch.storage_path is not null
      and batch.lease_token is not null
      and batch.locked_until < now()
      and batch.attempt_count < batch.max_attempts
    returning batch.id
  )
  select count(*)::integer, coalesce(array_agg(id), '{}'::uuid[])
  into v_retried, v_retried_ids
  from recovered;

  with closed as (
    update public.import_batches as batch
    set
      status = 'failed',
      error_message = case
        when batch.storage_path is not null then 'งานนำเข้าสูญเสีย lease และ retry ครบแล้ว'
        else 'งานนำเข้าไม่มี heartbeat เกิน 2 ชั่วโมงและถูกปิดอัตโนมัติ'
      end,
      completed_at = now(),
      lease_token = null,
      locked_until = null
    where
      (
        batch.status = 'running'
        and batch.storage_path is not null
        and batch.lease_token is not null
        and batch.locked_until < now()
        and batch.attempt_count >= batch.max_attempts
      )
      or (
        batch.storage_path is null
        and (
          (batch.status = 'queued' and batch.imported_at < now() - interval '2 hours')
          or (
            batch.status = 'running'
            and coalesce(batch.heartbeat_at, batch.imported_at) < now() - interval '2 hours'
          )
        )
      )
    returning batch.id
  )
  select count(*)::integer, coalesce(array_agg(id), '{}'::uuid[])
  into v_failed, v_failed_ids
  from closed;

  insert into public.audit_events (
    actor_role, action, resource_type, resource_id, outcome, metadata
  )
  select
    'system',
    'import.stale_recovered',
    'import_batch',
    recovered.id::text,
    'failure',
    jsonb_build_object(
      'result', case when recovered.id = any(v_retried_ids) then 'queued' else 'failed' end,
      'recoverySource', 'maintenance'
    )
  from unnest(v_retried_ids || v_failed_ids) as recovered(id);

  return jsonb_build_object(
    'recovered', v_retried + v_failed,
    'retried', v_retried,
    'failed', v_failed,
    'importBatchIds', to_jsonb(v_retried_ids || v_failed_ids)
  );
end;
$$;

revoke execute on function public.claim_import_batches(integer, integer) from public, anon, authenticated;
revoke execute on function public.heartbeat_claimed_import_batch(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.apply_claimed_import_batch(
  uuid, uuid, jsonb, jsonb, integer, integer, integer, integer, integer,
  integer, integer, integer
) from public, anon, authenticated;
revoke execute on function public.release_import_batch_claim(uuid, uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.claim_import_batches(integer, integer) to service_role;
grant execute on function public.heartbeat_claimed_import_batch(uuid, uuid, integer) to service_role;
grant execute on function public.apply_claimed_import_batch(
  uuid, uuid, jsonb, jsonb, integer, integer, integer, integer, integer,
  integer, integer, integer
) to service_role;
grant execute on function public.release_import_batch_claim(uuid, uuid, text, boolean) to service_role;

commit;
