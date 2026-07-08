create table if not exists public.report_archives (
  id uuid primary key default gen_random_uuid(),
  source_report_batch_id uuid not null,
  report_date date not null,
  report_created_at timestamptz not null,
  archived_at timestamptz not null default now(),
  note text,
  department_count integer not null default 0,
  item_count integer not null default 0,
  evidence_uploaded_count integer not null default 0,
  evidence_pending_count integer not null default 0,
  completion_status text not null default 'incomplete',
  departments jsonb not null default '[]'::jsonb,
  evidence_files jsonb not null default '[]'::jsonb,
  source_deleted boolean not null default false,
  source_deleted_at timestamptz,
  unique (source_report_batch_id)
);

create index if not exists idx_report_archives_report_date
on public.report_archives (report_date desc);

create index if not exists idx_report_archives_archived_at
on public.report_archives (archived_at desc);

create index if not exists idx_report_archives_completion
on public.report_archives (completion_status);
