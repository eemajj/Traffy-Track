-- Stage 2.2: move dashboard range aggregation into Postgres so the app stops
-- loading every ticket row into memory just to count them.
--
-- Mirrors the scoping rules of lib/dashboard/statistics-query.ts:
--   district scope : has district department OR not an external-agency response
--   external scope : no district department AND (external response OR
--                    state = ส่งต่อ(ใหม่) OR ticket_origin = external_intake)
--
-- The application falls back to row-loading while this RPC does not exist yet.

begin;

create or replace function public.dashboard_range_overview(
  p_from timestamptz,
  p_to timestamptz,
  p_scope text default 'all',
  p_dept text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_scope not in ('district', 'external', 'all') then
    raise exception 'unknown dashboard scope %', p_scope;
  end if;

  with base as (
    select
      b.state, b.type, b.star, b.dept_list, b.org_response, b.ticket_origin,
      coalesce(array_length(b.dept_list, 1), 0) > 0 as has_dept,
      coalesce((
        select btrim(u.o)
        from unnest(string_to_array(b.org_response, ',')) with ordinality as u(o, ord)
        where length(btrim(u.o)) > 0
        order by u.ord desc
        limit 1
      ), '') as final_org,
      btrim(coalesce(b.state, '')) as norm_state
    from public.tickets b
    where b.timestamp >= p_from and b.timestamp < p_to
  ),
  flagged as (
    select
      *,
      (
        final_org <> ''
        and final_org not like '%ทวีวัฒนา%'
        and left(final_org, char_length('ฝ่าย')) <> 'ฝ่าย'
      ) as is_external
    from base
  ),
  scoped as (
    select *
    from flagged
    where case p_scope
        when 'district' then has_dept or not is_external
        when 'external' then not has_dept
          and (is_external or norm_state = 'ส่งต่อ(ใหม่)' or ticket_origin = 'external_intake')
        else true
      end
      and (p_dept is null or p_dept = any (dept_list))
  )
  select jsonb_build_object(
    'total', count(*),
    'status_counts', coalesce((
      select jsonb_object_agg(s.norm_state, s.cnt)
      from (select norm_state, count(*) as cnt from scoped group by 1) s
    ), '{}'::jsonb),
    'problem_type_counts', coalesce((
      select jsonb_object_agg(p.name, p.cnt)
      from (
        select coalesce(nullif(btrim(type), ''), 'ไม่ระบุประเภท') as name, count(*) as cnt
        from scoped group by 1
      ) p
    ), '{}'::jsonb),
    'feedback_count', count(*) filter (where star between 1 and 5),
    'feedback_total', coalesce(sum(star) filter (where star between 1 and 5), 0),
    'finished_low_rating', count(*) filter (where norm_state = 'เสร็จสิ้น' and star in (1, 2)),
    'external_intake_count', count(*) filter (where ticket_origin = 'external_intake'),
    'origin_data_available', exists (select 1 from scoped s2 where s2.ticket_origin is not null)
  )
  into v_result
  from scoped;

  return v_result;
end;
$$;

revoke execute on function public.dashboard_range_overview(timestamptz, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.dashboard_range_overview(timestamptz, timestamptz, text, text)
  to service_role;

commit;