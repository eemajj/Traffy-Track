begin;

-- Large CityData imports perform one atomic upsert/history transaction. Keep
-- the database timeout inside the Vercel worker budget while allowing the
-- 14k-row payload to finish beyond the default PostgREST statement timeout.
alter function public.apply_claimed_import_batch(
  uuid, uuid, jsonb, jsonb, integer, integer, integer, integer, integer,
  integer, integer, integer
) set statement_timeout = '45s';

-- A retry claim previously cleared the useful database error. Preserve it
-- while queued/running so operators can see why the prior attempt was retried;
-- a successful atomic apply still clears it when status becomes completed.
create or replace function public.preserve_import_retry_error()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'queued'
    and new.status = 'running'
    and old.error_message is not null
    and new.error_message is null then
    new.error_message := old.error_message;
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_import_retry_error_on_claim on public.import_batches;
create trigger preserve_import_retry_error_on_claim
before update on public.import_batches
for each row
execute function public.preserve_import_retry_error();

revoke execute on function public.preserve_import_retry_error() from public, anon, authenticated;

commit;
