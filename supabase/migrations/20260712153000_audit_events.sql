begin;

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_role text not null check (actor_role in ('admin', 'operator', 'system')),
  action text not null,
  resource_type text not null,
  resource_id text,
  outcome text not null default 'success' check (outcome in ('success', 'failure')),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_audit_events_occurred_at
  on public.audit_events (occurred_at desc);

create index if not exists idx_audit_events_action
  on public.audit_events (action, occurred_at desc);

alter table public.audit_events enable row level security;
revoke all privileges on public.audit_events from anon, authenticated;
grant all privileges on public.audit_events to service_role;
grant usage, select on sequence public.audit_events_id_seq to service_role;

commit;
