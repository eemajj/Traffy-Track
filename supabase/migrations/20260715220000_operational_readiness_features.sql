begin;

alter table public.passcode_profiles
  add column if not exists expires_at timestamptz,
  add column if not exists passcode_changed_at timestamptz not null default now(),
  add column if not exists must_rotate boolean not null default false,
  add column if not exists login_count bigint not null default 0 check (login_count >= 0);

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.passcode_profiles'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%permissions <@%'
  limit 1;
  if constraint_name is not null then
    execute format('alter table public.passcode_profiles drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.passcode_profiles
  add constraint passcode_profiles_permissions_allowed_check check (
    cardinality(permissions) > 0
    and permissions <@ array[
      'dashboard:view', 'analytics:view', 'analytics:export', 'map:view',
      'cases:view', 'cases:assign', 'import:manage', 'reports:manage',
      'reports:create', 'reports:export', 'reports:evidence', 'admin:manage',
      'admin:access', 'admin:backup', 'admin:operations', 'system:maintenance'
    ]::text[]
  );

create or replace function public.bump_passcode_profile_access_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.display_name := btrim(new.display_name);
  new.position := nullif(btrim(new.position), '');
  new.role_label := btrim(new.role_label);
  new.permissions := array(
    select distinct permission from unnest(new.permissions) as permission order by permission
  );
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.access_version := old.access_version + 1;
    if new.passcode_digest is distinct from old.passcode_digest then
      new.passcode_changed_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bump_passcode_profile_access_version on public.passcode_profiles;
create trigger bump_passcode_profile_access_version
before insert or update of
  display_name, position, role_label, passcode_digest, permissions, is_admin,
  is_active, expires_at, must_rotate
on public.passcode_profiles
for each row execute function public.bump_passcode_profile_access_version();

create index if not exists idx_passcode_profiles_expiry
  on public.passcode_profiles (expires_at) where is_active;

create table if not exists public.system_settings (
  singleton boolean primary key default true check (singleton),
  maintenance_enabled boolean not null default false,
  maintenance_message text not null default 'ระบบอยู่ระหว่างบำรุงรักษา กรุณาลองใหม่ภายหลัง',
  maintenance_started_at timestamptz,
  maintenance_started_by text,
  updated_at timestamptz not null default now()
);

insert into public.system_settings (singleton) values (true)
on conflict (singleton) do nothing;

create table if not exists public.system_notifications (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  message text not null check (char_length(btrim(message)) between 2 and 1000),
  href text,
  target_permissions text[] not null default array['admin:manage']::text[],
  is_resolved boolean not null default false,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_system_notifications_open
  on public.system_notifications (is_resolved, severity, last_detected_at desc);

alter table public.system_settings enable row level security;
alter table public.system_notifications enable row level security;
revoke all privileges on public.system_settings, public.system_notifications from public, anon, authenticated;
grant select, insert, update on public.system_settings to service_role;
grant select, insert, update, delete on public.system_notifications to service_role;

create or replace function public.create_system_backup_snapshot()
returns jsonb language sql volatile security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'snapshotId', gen_random_uuid(), 'generatedAt', statement_timestamp(),
    'tables', jsonb_build_object(
      'tickets', coalesce((select jsonb_agg(to_jsonb(row) order by row.ticket_id) from public.tickets row), '[]'::jsonb),
      'ticket_history', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.ticket_history row), '[]'::jsonb),
      'import_batches', coalesce((select jsonb_agg(to_jsonb(row) order by row.imported_at, row.id) from public.import_batches row), '[]'::jsonb),
      'report_batches', coalesce((select jsonb_agg(to_jsonb(row) order by row.created_at, row.id) from public.report_batches row), '[]'::jsonb),
      'report_batch_departments', coalesce((select jsonb_agg(to_jsonb(row) order by row.report_batch_id, row.dept_name) from public.report_batch_departments row), '[]'::jsonb),
      'report_batch_items', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.report_batch_items row), '[]'::jsonb),
      'report_archives', coalesce((select jsonb_agg(to_jsonb(row) order by row.archived_at, row.id) from public.report_archives row), '[]'::jsonb),
      'ticket_assignment_events', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.ticket_assignment_events row), '[]'::jsonb),
      'report_workflow_events', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.report_workflow_events row), '[]'::jsonb),
      'report_evidence_versions', coalesce((select jsonb_agg(to_jsonb(row) order by row.report_batch_department_id, row.version_number) from public.report_evidence_versions row), '[]'::jsonb),
      'report_evidence_status_events', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.report_evidence_status_events row), '[]'::jsonb),
      'audit_events', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.audit_events row), '[]'::jsonb),
      'passcode_profiles', coalesce((select jsonb_agg(to_jsonb(row) order by row.display_name, row.id) from public.passcode_profiles row), '[]'::jsonb),
      'system_settings', coalesce((select jsonb_agg(to_jsonb(row)) from public.system_settings row), '[]'::jsonb),
      'system_notifications', coalesce((select jsonb_agg(to_jsonb(row) order by row.created_at, row.id) from public.system_notifications row), '[]'::jsonb)
    )
  );
$$;
revoke execute on function public.create_system_backup_snapshot() from public, anon, authenticated;
grant execute on function public.create_system_backup_snapshot() to service_role;
alter function public.create_system_backup_snapshot() set statement_timeout = '120s';

commit;
