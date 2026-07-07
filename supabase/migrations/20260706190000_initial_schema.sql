create extension if not exists pgcrypto;

create table if not exists public.tickets (
  ticket_id text primary key,
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
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tickets_state on public.tickets (state);
create index if not exists idx_tickets_dept_list on public.tickets using gin (dept_list);
create index if not exists idx_tickets_last_activity on public.tickets (last_activity desc);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  imported_at timestamptz not null default now(),
  filename text,
  total_rows integer not null default 0,
  new_tickets integer not null default 0,
  changed_tickets integer not null default 0,
  unchanged_tickets integer not null default 0
);

create table if not exists public.ticket_history (
  id bigserial primary key,
  ticket_id text not null references public.tickets(ticket_id) on delete cascade,
  changed_field text not null,
  old_value text,
  new_value text,
  detected_at timestamptz not null default now(),
  import_batch_id uuid references public.import_batches(id) on delete set null
);

create index if not exists idx_ticket_history_ticket_id on public.ticket_history (ticket_id);
create index if not exists idx_ticket_history_import_batch_id on public.ticket_history (import_batch_id);
create index if not exists idx_ticket_history_detected_at on public.ticket_history (detected_at desc);

create table if not exists public.report_batches (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  created_at timestamptz not null default now(),
  note text
);

create index if not exists idx_report_batches_report_date on public.report_batches (report_date desc);

create table if not exists public.report_batch_departments (
  id uuid primary key default gen_random_uuid(),
  report_batch_id uuid not null references public.report_batches(id) on delete cascade,
  dept_name text not null,
  evidence_file_url text,
  evidence_uploaded_at timestamptz,
  unique (report_batch_id, dept_name)
);

create index if not exists idx_report_batch_departments_batch on public.report_batch_departments (report_batch_id);

create table if not exists public.report_batch_items (
  id bigserial primary key,
  report_batch_id uuid not null references public.report_batches(id) on delete cascade,
  dept_name text not null,
  ticket_id text not null references public.tickets(ticket_id) on delete restrict
);

create index if not exists idx_report_batch_items_batch on public.report_batch_items (report_batch_id);
create index if not exists idx_report_batch_items_dept_name on public.report_batch_items (dept_name);
create index if not exists idx_report_batch_items_ticket_id on public.report_batch_items (ticket_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_tickets_updated_at on public.tickets;
create trigger set_tickets_updated_at
before update on public.tickets
for each row
execute function public.set_updated_at();

create or replace function public.dashboard_pending_by_department()
returns table (
  dept_name text,
  pending_count bigint
)
language sql
as $$
  select dept, count(*) as pending_count
  from public.tickets, unnest(dept_list) as dept
  where state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)')
  group by dept
  order by count(*) desc, dept asc
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-evidence',
  'report-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
