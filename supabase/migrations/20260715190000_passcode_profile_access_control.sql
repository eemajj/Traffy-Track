begin;

create table if not exists public.passcode_profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  position text check (position is null or char_length(btrim(position)) between 2 and 160),
  role_label text not null check (char_length(btrim(role_label)) between 2 and 80),
  passcode_digest text not null unique check (passcode_digest ~ '^[0-9a-f]{64}$'),
  permissions text[] not null default '{}',
  is_admin boolean not null default false,
  is_active boolean not null default true,
  access_version integer not null default 1 check (access_version > 0),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    cardinality(permissions) > 0
    and permissions <@ array[
      'dashboard:view',
      'analytics:view',
      'map:view',
      'cases:view',
      'import:manage',
      'reports:manage',
      'admin:manage'
    ]::text[]
  ),
  check (
    (is_admin and 'admin:manage' = any(permissions))
    or (not is_admin and not ('admin:manage' = any(permissions)))
  )
);

create index if not exists idx_passcode_profiles_active_name
  on public.passcode_profiles (is_active desc, display_name asc);

create index if not exists idx_passcode_profiles_last_used
  on public.passcode_profiles (last_used_at desc nulls last);

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
    select distinct permission
    from unnest(new.permissions) as permission
    order by permission
  );
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.access_version := old.access_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists bump_passcode_profile_access_version on public.passcode_profiles;
create trigger bump_passcode_profile_access_version
before insert or update of
  display_name,
  position,
  role_label,
  passcode_digest,
  permissions,
  is_admin,
  is_active
on public.passcode_profiles
for each row execute function public.bump_passcode_profile_access_version();

alter table public.passcode_profiles enable row level security;
revoke all privileges on public.passcode_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.passcode_profiles to service_role;

-- Keep access configuration inside the encrypted system backup. The digest is
-- a one-way HMAC and the plaintext Passcode is never stored or exported.
create or replace function public.create_system_backup_snapshot()
returns jsonb
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'snapshotId', gen_random_uuid(),
    'generatedAt', statement_timestamp(),
    'tables', jsonb_build_object(
      'tickets', coalesce((select jsonb_agg(to_jsonb(row) order by row.ticket_id) from public.tickets as row), '[]'::jsonb),
      'ticket_history', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.ticket_history as row), '[]'::jsonb),
      'import_batches', coalesce((select jsonb_agg(to_jsonb(row) order by row.imported_at, row.id) from public.import_batches as row), '[]'::jsonb),
      'report_batches', coalesce((select jsonb_agg(to_jsonb(row) order by row.created_at, row.id) from public.report_batches as row), '[]'::jsonb),
      'report_batch_departments', coalesce((select jsonb_agg(to_jsonb(row) order by row.report_batch_id, row.dept_name) from public.report_batch_departments as row), '[]'::jsonb),
      'report_batch_items', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.report_batch_items as row), '[]'::jsonb),
      'report_archives', coalesce((select jsonb_agg(to_jsonb(row) order by row.archived_at, row.id) from public.report_archives as row), '[]'::jsonb),
      'ticket_assignment_events', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.ticket_assignment_events as row), '[]'::jsonb),
      'report_workflow_events', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.report_workflow_events as row), '[]'::jsonb),
      'report_evidence_versions', coalesce((select jsonb_agg(to_jsonb(row) order by row.report_batch_department_id, row.version_number) from public.report_evidence_versions as row), '[]'::jsonb),
      'report_evidence_status_events', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.report_evidence_status_events as row), '[]'::jsonb),
      'audit_events', coalesce((select jsonb_agg(to_jsonb(row) order by row.id) from public.audit_events as row), '[]'::jsonb),
      'passcode_profiles', coalesce((select jsonb_agg(to_jsonb(row) order by row.display_name, row.id) from public.passcode_profiles as row), '[]'::jsonb)
    )
  );
$$;

revoke execute on function public.create_system_backup_snapshot()
from public, anon, authenticated;
grant execute on function public.create_system_backup_snapshot()
to service_role;
alter function public.create_system_backup_snapshot() set statement_timeout = '120s';

commit;
