begin;

-- These application tables are server-only. With no policies, RLS denies every
-- request made with anon or authenticated credentials even if a grant is added
-- accidentally later.
alter table public.tickets enable row level security;
alter table public.import_batches enable row level security;
alter table public.ticket_history enable row level security;
alter table public.report_batches enable row level security;
alter table public.report_batch_departments enable row level security;
alter table public.report_batch_items enable row level security;
alter table public.report_archives enable row level security;

-- Remove the PostgREST data surface from browser-facing roles.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

-- PostgreSQL grants function execution to PUBLIC by default, so revoke it
-- explicitly for the RPC exposed through PostgREST.
revoke execute on function public.dashboard_pending_by_department()
from public, anon, authenticated;

-- The application server uses the service-role key for all database access.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Apply the same deny-by-default posture to objects created by future
-- migrations running as this migration role.
alter default privileges in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

commit;
