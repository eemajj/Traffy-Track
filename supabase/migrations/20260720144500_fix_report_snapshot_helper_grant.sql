begin;

-- The read-only CityData migration replaced the public snapshot entry point
-- with a SECURITY INVOKER wrapper. Keep the helper private, but grant the
-- application service role permission for the wrapper's internal call.
grant execute on function public.create_report_batch_snapshot_without_triage_gate(date, text, uuid)
to service_role;

commit;
