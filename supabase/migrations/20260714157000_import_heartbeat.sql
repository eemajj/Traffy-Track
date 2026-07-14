begin;

alter table public.import_batches
  add column if not exists heartbeat_at timestamptz;

update public.import_batches
set heartbeat_at = imported_at
where status = 'running' and heartbeat_at is null;

create or replace function public.heartbeat_import_batch(p_import_batch_id uuid)
returns boolean
language sql
security invoker
set search_path = public
as $$
  update public.import_batches
  set heartbeat_at = now()
  where id = p_import_batch_id and status = 'running'
  returning true;
$$;

-- Queued jobs have not emitted a heartbeat yet. Running jobs are stale only
-- when their latest heartbeat is stale, preventing long healthy imports from
-- being recovered based on their original queue time.
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
    where
      (status = 'queued' and imported_at < now() - interval '2 hours')
      or (
        status = 'running'
        and coalesce(heartbeat_at, imported_at) < now() - interval '2 hours'
      )
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
          where (status = 'queued' and imported_at < now() - interval '2 hours')
            or (
              status = 'running'
              and coalesce(heartbeat_at, imported_at) < now() - interval '2 hours'
            )
        ),
        'staleQueued', count(*) filter (
          where status = 'queued' and imported_at < now() - interval '2 hours'
        ),
        'staleRunning', count(*) filter (
          where status = 'running'
            and coalesce(heartbeat_at, imported_at) < now() - interval '2 hours'
        ),
        'oldestActiveAt', min(imported_at) filter (
          where status in ('queued', 'running')
        ),
        'oldestHeartbeatAt', min(coalesce(heartbeat_at, imported_at)) filter (
          where status = 'running'
        )
      )
      from public.import_batches
    )
  )
  from public.storage_deletion_outbox;
$$;

revoke execute on function public.heartbeat_import_batch(uuid) from public, anon, authenticated;
grant execute on function public.heartbeat_import_batch(uuid) to service_role;

commit;
