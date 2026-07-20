begin;

create table if not exists public.login_rate_limits (
  identifier_hash text primary key check (identifier_hash ~ '^[a-f0-9]{64}$'),
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.login_rate_limits enable row level security;
revoke all privileges on public.login_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.login_rate_limits to service_role;

create or replace function public.consume_login_attempt(
  p_identifier_hash text,
  p_succeeded boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.login_rate_limits%rowtype;
  v_attempts integer;
  v_blocked_until timestamptz;
begin
  if p_identifier_hash is null or p_identifier_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid login identifier hash';
  end if;

  insert into public.login_rate_limits (identifier_hash)
  values (p_identifier_hash)
  on conflict (identifier_hash) do nothing;

  select * into v_row
  from public.login_rate_limits
  where identifier_hash = p_identifier_hash
  for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    return jsonb_build_object(
      'allowed', false,
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer)
    );
  end if;

  if p_succeeded then
    update public.login_rate_limits
    set failed_attempts = 0,
        window_started_at = v_now,
        blocked_until = null,
        updated_at = v_now
    where identifier_hash = p_identifier_hash;
    return jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
  end if;

  v_attempts := case
    when v_row.window_started_at < v_now - interval '15 minutes' then 1
    else v_row.failed_attempts + 1
  end;
  v_blocked_until := case when v_attempts >= 5 then v_now + interval '15 minutes' else null end;

  update public.login_rate_limits
  set failed_attempts = v_attempts,
      window_started_at = case
        when v_row.window_started_at < v_now - interval '15 minutes' then v_now
        else v_row.window_started_at
      end,
      blocked_until = v_blocked_until,
      updated_at = v_now
  where identifier_hash = p_identifier_hash;

  return jsonb_build_object(
    'allowed', v_blocked_until is null,
    'retryAfterSeconds', case when v_blocked_until is null then 0 else 900 end
  );
end;
$$;

revoke execute on function public.consume_login_attempt(text, boolean) from public, anon, authenticated;
grant execute on function public.consume_login_attempt(text, boolean) to service_role;

create or replace function public.audit_report_batch_created()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_events (
    actor_role, action, resource_type, resource_id, outcome, metadata
  ) values (
    'system',
    'report.created',
    'report_batch',
    new.id::text,
    'success',
    jsonb_build_object(
      'reportDate', new.report_date,
      'sourceImportBatchId', new.source_import_batch_id,
      'auditSource', 'database_trigger'
    )
  );
  return new;
end;
$$;

drop trigger if exists audit_report_batch_created on public.report_batches;
create trigger audit_report_batch_created
after insert on public.report_batches
for each row execute function public.audit_report_batch_created();

revoke all on function public.audit_report_batch_created() from public, anon, authenticated;

create index if not exists idx_login_rate_limits_updated_at
  on public.login_rate_limits (updated_at);

commit;
