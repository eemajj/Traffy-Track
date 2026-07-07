alter table public.import_batches
add column if not exists status text not null default 'completed',
add column if not exists error_message text,
add column if not exists completed_at timestamptz;

update public.import_batches
set completed_at = imported_at
where completed_at is null
  and status = 'completed';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'import_batches_status_check'
      and conrelid = 'public.import_batches'::regclass
  ) then
    alter table public.import_batches
    add constraint import_batches_status_check
    check (status in ('running', 'completed', 'failed'));
  end if;
end
$$;

create index if not exists idx_import_batches_status on public.import_batches (status);
