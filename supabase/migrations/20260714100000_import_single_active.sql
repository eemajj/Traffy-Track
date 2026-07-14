begin;

-- Release abandoned jobs before enforcing the invariant. The durable-worker phase
-- will replace this age-based recovery with leases and heartbeats.
update public.import_batches
set
  status = 'failed',
  error_message = 'งานนำเข้าหมดเวลาและถูกปิดอัตโนมัติก่อนเปิดใช้ single-active guard',
  completed_at = now()
where status in ('queued', 'running')
  and imported_at < now() - interval '2 hours';

-- A constant-expression partial unique index makes concurrent queue attempts
-- serialize at the database boundary, not in an application-side pre-check.
create unique index if not exists idx_import_batches_single_active
  on public.import_batches ((1))
  where status in ('queued', 'running');

commit;
