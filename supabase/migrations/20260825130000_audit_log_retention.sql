-- Audit events grow forever without a retention policy. This purge runs in the
-- nightly maintenance cron; the floor of 90 days protects minimum auditability.
begin;

create or replace function public.purge_old_audit_events(
  p_retention_days integer default 730,
  p_batch_limit integer default 5000
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if p_retention_days < 90 then
    raise exception 'audit retention must be at least 90 days';
  end if;

  with deleted as (
    delete from public.audit_events
    where id in (
      select id from public.audit_events
      where occurred_at < now() - make_interval(days => p_retention_days)
      order by occurred_at
      limit p_batch_limit
    )
    returning 1
  )
  select count(*) into v_deleted from deleted;

  return v_deleted;
end;
$$;

revoke execute on function public.purge_old_audit_events(integer, integer)
  from public, anon, authenticated;
grant execute on function public.purge_old_audit_events(integer, integer)
  to service_role;

commit;