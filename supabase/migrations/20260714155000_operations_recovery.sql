begin;

alter table public.storage_deletion_outbox
  drop constraint if exists storage_deletion_outbox_status_check;

alter table public.storage_deletion_outbox
  add constraint storage_deletion_outbox_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'dead'));

create or replace function public.reset_storage_deletion_retry_on_new_request()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'pending' and old.status in ('completed', 'dead') then
    new.attempts := 0;
    new.lease_token := null;
    new.locked_until := null;
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_storage_deletion_retry_on_new_request
on public.storage_deletion_outbox;
create trigger reset_storage_deletion_retry_on_new_request
before update on public.storage_deletion_outbox
for each row execute function public.reset_storage_deletion_retry_on_new_request();

update public.storage_deletion_outbox
set
  status = 'dead',
  locked_until = null,
  lease_token = null,
  updated_at = now(),
  last_error = coalesce(last_error, 'Storage deletion reached the maximum retry limit')
where attempts >= 10
  and (
    status = 'failed'
    or (status = 'processing' and locked_until < now())
  );

create or replace function public.claim_storage_deletions(p_limit integer default 100)
returns table (id uuid, bucket text, object_path text, lease_token uuid, attempts integer)
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.storage_deletion_outbox
  set
    status = 'dead',
    lease_token = null,
    locked_until = null,
    updated_at = now(),
    last_error = coalesce(last_error, 'Storage deletion reached the maximum retry limit')
  where attempts >= 10
    and (
      status = 'failed'
      or (status = 'processing' and locked_until < now())
    );

  return query
  with candidates as (
    select job.id
    from public.storage_deletion_outbox as job
    where job.attempts < 10
      and (
        (job.status in ('pending', 'failed') and job.next_attempt_at <= now())
        or (job.status = 'processing' and job.locked_until < now())
      )
    order by job.requested_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ), claimed as (
    update public.storage_deletion_outbox as job
    set
      status = 'processing',
      attempts = job.attempts + 1,
      lease_token = gen_random_uuid(),
      locked_until = now() + interval '5 minutes',
      updated_at = now()
    from candidates
    where job.id = candidates.id
    returning job.id, job.bucket, job.object_path, job.lease_token, job.attempts
  )
  select * from claimed;
end;
$$;

create or replace function public.fail_storage_deletion(p_id uuid, p_lease_token uuid, p_error text)
returns boolean
language sql
security invoker
set search_path = public
as $$
  update public.storage_deletion_outbox
  set
    status = case when attempts >= 10 then 'dead' else 'failed' end,
    next_attempt_at = case
      when attempts >= 10 then next_attempt_at
      else now() + least(interval '24 hours', interval '1 minute' * power(2, least(attempts, 10)))
    end,
    lease_token = null,
    locked_until = null,
    updated_at = now(),
    last_error = left(coalesce(p_error, 'unknown storage error'), 1000)
  where id = p_id and status = 'processing' and lease_token = p_lease_token
  returning true;
$$;

-- A recovered stale job must not be able to apply its payload later. Lock and
-- verify the running state before any ticket/history mutation.
create or replace function public.apply_import_batch(
  p_import_batch_id uuid,
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
  where id = p_import_batch_id and status = 'running'
  for update;
  if not found then
    raise exception 'Import batch % is no longer running', p_import_batch_id;
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
    completed_at = now()
  where id = p_import_batch_id and status = 'running';

  if not found then
    raise exception 'Import batch % changed state during apply', p_import_batch_id;
  end if;
end;
$$;

create or replace function public.recover_stale_import_jobs()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ids jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  with candidates as (
    select id, filename, status as previous_status
    from public.import_batches
    where status in ('queued', 'running')
      and imported_at < now() - interval '2 hours'
    for update skip locked
  ), recovered as (
    update public.import_batches as batch
    set
      status = 'failed',
      error_message = 'งานนำเข้าไม่มี heartbeat เกิน 2 ชั่วโมงและถูกปิดอัตโนมัติ',
      completed_at = now()
    from candidates
    where batch.id = candidates.id
    returning batch.id, batch.filename, candidates.previous_status
  ), audited as (
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
        'filename', recovered.filename,
        'previousStatus', recovered.previous_status,
        'staleAfterMinutes', 120
      )
    from recovered
    returning resource_id
  )
  select
    coalesce(jsonb_agg(audited.resource_id order by audited.resource_id), '[]'::jsonb),
    count(*)::integer
  into v_ids, v_count
  from audited;

  return jsonb_build_object('recovered', v_count, 'importBatchIds', v_ids);
end;
$$;

create or replace function public.operations_health_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'outbox', jsonb_build_object(
      'pending', count(*) filter (where status = 'pending'),
      'processing', count(*) filter (where status = 'processing'),
      'failed', count(*) filter (where status = 'failed'),
      'dead', count(*) filter (where status = 'dead'),
      'staleLeases', count(*) filter (
        where status = 'processing' and locked_until < now()
      ),
      'oldestActionableAt', min(requested_at) filter (
        where status in ('pending', 'failed')
          or (status = 'processing' and locked_until < now())
      ),
      'oldestDeadAt', min(updated_at) filter (where status = 'dead'),
      'maxAttempts', coalesce(max(attempts), 0)
    ),
    'imports', (
      select jsonb_build_object(
        'active', count(*) filter (where status in ('queued', 'running')),
        'failed', count(*) filter (where status = 'failed'),
        'staleActive', count(*) filter (
          where status in ('queued', 'running')
            and imported_at < now() - interval '2 hours'
        ),
        'oldestActiveAt', min(imported_at) filter (
          where status in ('queued', 'running')
        )
      )
      from public.import_batches
    )
  )
  from public.storage_deletion_outbox;
$$;

revoke execute on function public.recover_stale_import_jobs() from public, anon, authenticated;
revoke execute on function public.operations_health_snapshot() from public, anon, authenticated;
grant execute on function public.recover_stale_import_jobs() to service_role;
grant execute on function public.operations_health_snapshot() to service_role;

commit;
