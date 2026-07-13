begin;

-- Aggregate the analytics dashboard in Postgres so the application does not
-- download thousands of ticket rows on every page view. Closure duration uses
-- the first observed state transition into a closed state after the ticket was
-- created; tickets that were already closed before history tracking began are
-- intentionally excluded from that duration sample.
create or replace function public.analytics_overview(p_days integer default 90)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with
  params as (
    select
      case
        when coalesce(p_days, 90) in (30, 90, 180) then coalesce(p_days, 90)
        else 90
      end::integer as days,
      date_trunc('day', timezone('Asia/Bangkok', now())) as today_local
  ),
  bounds as (
    select
      days,
      (today_local - ((days - 1) * interval '1 day')) at time zone 'Asia/Bangkok' as start_at,
      (today_local + interval '1 day') at time zone 'Asia/Bangkok' as end_at
    from params
  ),
  first_closure as (
    select distinct on (history.ticket_id)
      history.ticket_id,
      history.detected_at as closed_at,
      ticket.timestamp as created_at,
      ticket.dept_list
    from public.ticket_history as history
    join public.tickets as ticket on ticket.ticket_id = history.ticket_id
    where history.changed_field = 'state'
      and history.new_value = any (array['เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)'])
      and ticket.timestamp is not null
      and history.detected_at >= ticket.timestamp
    order by history.ticket_id, history.detected_at asc
  ),
  closure_in_period as (
    select
      closure.*,
      extract(epoch from (closure.closed_at - closure.created_at)) / 3600.0 as duration_hours
    from first_closure as closure
    cross join bounds
    where closure.closed_at >= bounds.start_at
      and closure.closed_at < bounds.end_at
  ),
  tickets_created_in_period as (
    select ticket.*
    from public.tickets as ticket
    cross join bounds
    where ticket.timestamp >= bounds.start_at
      and ticket.timestamp < bounds.end_at
  ),
  week_series as (
    select generate_series(
      date_trunc('week', timezone('Asia/Bangkok', bounds.start_at)),
      date_trunc('week', timezone('Asia/Bangkok', bounds.end_at - interval '1 second')),
      interval '1 week'
    ) as bucket_start
    from bounds
  ),
  created_by_week as (
    select
      date_trunc('week', timezone('Asia/Bangkok', ticket.timestamp)) as bucket_start,
      count(*)::integer as created_count
    from tickets_created_in_period as ticket
    group by 1
  ),
  closed_by_week as (
    select
      date_trunc('week', timezone('Asia/Bangkok', closure.closed_at)) as bucket_start,
      count(*)::integer as closed_count
    from closure_in_period as closure
    group by 1
  ),
  trend as (
    select
      to_char(series.bucket_start, 'YYYY-MM-DD') as bucket_start,
      coalesce(created.created_count, 0)::integer as created_count,
      coalesce(closed.closed_count, 0)::integer as closed_count
    from week_series as series
    left join created_by_week as created using (bucket_start)
    left join closed_by_week as closed using (bucket_start)
    order by series.bucket_start
  ),
  hotspot_base as (
    select
      floor(ticket.lat::numeric / 0.005) * 0.005 as grid_lat,
      floor(ticket.lng::numeric / 0.005) * 0.005 as grid_lng,
      coalesce(nullif(btrim(ticket.subdistrict), ''), 'ไม่ระบุแขวง') as subdistrict,
      ticket.address,
      ticket.lat::numeric as lat,
      ticket.lng::numeric as lng,
      ticket.state
    from tickets_created_in_period as ticket
    where ticket.lat between -90 and 90
      and ticket.lng between -180 and 180
  ),
  hotspots as (
    select
      subdistrict,
      mode() within group (order by nullif(btrim(address), '')) as sample_address,
      round(avg(lat), 6) as lat,
      round(avg(lng), 6) as lng,
      count(*)::integer as total_count,
      count(*) filter (
        where state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)')
      )::integer as pending_count
    from hotspot_base
    group by grid_lat, grid_lng, subdistrict
    order by count(*) desc, pending_count desc, subdistrict asc
    limit 8
  ),
  department_resolution as (
    select
      department.dept_name,
      count(*)::integer as closed_count,
      round(avg(closure.duration_hours)::numeric, 1) as average_hours
    from closure_in_period as closure
    cross join lateral unnest(coalesce(closure.dept_list, '{}'::text[])) as department(dept_name)
    group by department.dept_name
    order by avg(closure.duration_hours) asc, count(*) desc, department.dept_name asc
    limit 10
  ),
  pending_age_counts as (
    select
      case
        when ticket.timestamp is null then 'unknown'
        when ticket.timestamp >= now() - interval '7 days' then '0_7'
        when ticket.timestamp >= now() - interval '30 days' then '8_30'
        when ticket.timestamp >= now() - interval '90 days' then '31_90'
        else 'over_90'
      end as bucket_key,
      count(*)::integer as pending_count
    from public.tickets as ticket
    where ticket.state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)')
    group by 1
  ),
  age_bucket_keys(bucket_key, sort_order) as (
    values
      ('0_7'::text, 1),
      ('8_30'::text, 2),
      ('31_90'::text, 3),
      ('over_90'::text, 4),
      ('unknown'::text, 5)
  ),
  age_buckets as (
    select
      keys.bucket_key,
      coalesce(counts.pending_count, 0)::integer as pending_count
    from age_bucket_keys as keys
    left join pending_age_counts as counts using (bucket_key)
    order by keys.sort_order
  ),
  summary as (
    select jsonb_build_object(
      'createdCount', (select count(*)::integer from tickets_created_in_period),
      'closedCount', (select count(*)::integer from closure_in_period),
      'closeSampleCount', (select count(*)::integer from closure_in_period),
      'averageCloseHours', (
        select round(avg(duration_hours)::numeric, 1)
        from closure_in_period
      ),
      'medianCloseHours', (
        select round(percentile_cont(0.5) within group (order by duration_hours)::numeric, 1)
        from closure_in_period
      ),
      'pendingNow', (
        select count(*)::integer
        from public.tickets
        where state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)')
      ),
      'coordinateCoveragePercent', (
        select coalesce(
          round(
            100.0 * count(*) filter (
              where lat between -90 and 90 and lng between -180 and 180
            ) / nullif(count(*), 0),
            1
          ),
          0
        )
        from public.tickets
      )
    ) as value
  ),
  trend_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucketStart', bucket_start,
          'createdCount', created_count,
          'closedCount', closed_count
        ) order by bucket_start
      ),
      '[]'::jsonb
    ) as value
    from trend
  ),
  hotspots_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'subdistrict', subdistrict,
          'sampleAddress', sample_address,
          'lat', lat,
          'lng', lng,
          'totalCount', total_count,
          'pendingCount', pending_count
        ) order by total_count desc, pending_count desc, subdistrict asc
      ),
      '[]'::jsonb
    ) as value
    from hotspots
  ),
  department_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'departmentName', dept_name,
          'closedCount', closed_count,
          'averageHours', average_hours
        ) order by average_hours asc, closed_count desc, dept_name asc
      ),
      '[]'::jsonb
    ) as value
    from department_resolution
  ),
  age_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucketKey', bucket_key,
          'pendingCount', pending_count
        )
      ),
      '[]'::jsonb
    ) as value
    from age_buckets
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'periodDays', bounds.days,
    'summary', summary.value,
    'trend', trend_json.value,
    'hotspots', hotspots_json.value,
    'departmentResolution', department_json.value,
    'pendingAgeBuckets', age_json.value
  )
  from bounds
  cross join summary
  cross join trend_json
  cross join hotspots_json
  cross join department_json
  cross join age_json;
$$;

revoke execute on function public.analytics_overview(integer)
from public, anon, authenticated;

grant execute on function public.analytics_overview(integer)
to service_role;

commit;
