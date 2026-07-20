begin;

-- A full JSON snapshot can exceed the short interactive API timeout on the
-- current data volume. Scope a longer timeout to this service-role-only RPC;
-- ordinary application queries keep their existing timeout.
alter function public.create_system_backup_snapshot()
  set statement_timeout = '120s';

commit;
