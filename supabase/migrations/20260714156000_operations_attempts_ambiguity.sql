-- Resolve PL/pgSQL output-parameter names against outbox columns explicitly.
-- The previous function could be created successfully but failed at runtime
-- because the output parameter `attempts` shadowed the table column.
create or replace function public.claim_storage_deletions(p_limit integer default 100)
returns table (id uuid, bucket text, object_path text, lease_token uuid, attempts integer)
language plpgsql
security invoker
set search_path = public
as $$
#variable_conflict use_column
begin
  update public.storage_deletion_outbox as exhausted
  set
    status = 'dead',
    lease_token = null,
    locked_until = null,
    updated_at = now(),
    last_error = coalesce(
      exhausted.last_error,
      'Storage deletion reached the maximum retry limit'
    )
  where exhausted.attempts >= 10
    and (
      exhausted.status = 'failed'
      or (exhausted.status = 'processing' and exhausted.locked_until < now())
    );

  return query
  with candidates as (
    select candidate.id
    from public.storage_deletion_outbox as candidate
    where candidate.attempts < 10
      and (
        (candidate.status in ('pending', 'failed') and candidate.next_attempt_at <= now())
        or (candidate.status = 'processing' and candidate.locked_until < now())
      )
    order by candidate.requested_at
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
  select
    claimed.id,
    claimed.bucket,
    claimed.object_path,
    claimed.lease_token,
    claimed.attempts
  from claimed;
end;
$$;

revoke execute on function public.claim_storage_deletions(integer) from public, anon, authenticated;
grant execute on function public.claim_storage_deletions(integer) to service_role;
