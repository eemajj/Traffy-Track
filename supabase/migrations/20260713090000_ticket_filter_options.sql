create or replace function public.ticket_filter_options()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'states',
    coalesce(
      (
        select jsonb_agg(state order by state)
        from (
          select distinct btrim(state) as state
          from public.tickets
          where state is not null and btrim(state) <> ''
        ) distinct_states
      ),
      '[]'::jsonb
    ),
    'departments',
    coalesce(
      (
        select jsonb_agg(department order by department)
        from (
          select distinct btrim(department_name) as department
          from public.tickets
          cross join lateral unnest(coalesce(dept_list, '{}'::text[])) as department_name
          where btrim(department_name) <> ''
        ) distinct_departments
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.ticket_filter_options() from public;
revoke all on function public.ticket_filter_options() from anon;
revoke all on function public.ticket_filter_options() from authenticated;
grant execute on function public.ticket_filter_options() to service_role;
