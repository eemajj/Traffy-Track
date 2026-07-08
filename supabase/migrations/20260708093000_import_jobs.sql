alter table public.import_batches
add column if not exists processed_rows integer not null default 0,
add column if not exists duplicate_rows integer not null default 0,
add column if not exists reopened_tickets integer not null default 0,
add column if not exists changed_fields integer not null default 0;

alter table public.import_batches
drop constraint if exists import_batches_status_check;

alter table public.import_batches
add constraint import_batches_status_check
check (status in ('queued', 'running', 'completed', 'failed'));

create index if not exists idx_import_batches_imported_at
on public.import_batches (imported_at desc);
