begin;

create or replace function public.dashboard_pending_by_department()
returns table (
  dept_name text,
  pending_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select dept, count(*) as pending_count
  from public.tickets, unnest(coalesce(dept_list, '{}'::text[])) as dept
  where state is null
     or state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)')
  group by dept
  order by count(*) desc, dept asc
$$;

-- Keep the existing analytics contract while correcting every pending-state
-- predicate. This avoids duplicating the long aggregation function in a
-- one-line correctness migration.
do $$
declare
  function_definition text;
  closed_states text := '(''เสร็จสิ้น'', ''ไม่เกี่ยวข้อง'', ''ส่งต่อ(ใหม่)'')';
begin
  select pg_get_functiondef('public.analytics_overview(integer)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    'where ticket.state not in ' || closed_states,
    'where (ticket.state is null or ticket.state not in ' || closed_states || ')'
  );
  function_definition := replace(
    function_definition,
    'where state not in ' || closed_states,
    'where (state is null or state not in ' || closed_states || ')'
  );

  execute function_definition;
end
$$;

commit;
