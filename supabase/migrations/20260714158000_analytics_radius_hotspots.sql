begin;

create extension if not exists postgis with schema extensions;

-- Select up to eight non-overlapping 500 m hotspot centres. Every complaint is
-- assigned to its nearest selected centre at most once, so counts cannot be
-- duplicated and arbitrary coordinate-grid boundaries cannot split nearby
-- complaints into separate cells.
create or replace function public.analytics_radius_hotspots(
  p_days integer default 90,
  p_radius_m integer default 500,
  p_limit integer default 8
)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with recursive
  params as (
    select
      case when coalesce(p_days, 90) in (30, 90, 180) then coalesce(p_days, 90) else 90 end::integer as days,
      greatest(100, least(coalesce(p_radius_m, 500), 2000))::integer as radius_m,
      greatest(1, least(coalesce(p_limit, 8), 20))::integer as result_limit,
      date_trunc('day', timezone('Asia/Bangkok', now())) as today_local
  ),
  bounds as (
    select
      days,
      radius_m,
      result_limit,
      (today_local - ((days - 1) * interval '1 day')) at time zone 'Asia/Bangkok' as start_at,
      (today_local + interval '1 day') at time zone 'Asia/Bangkok' as end_at
    from params
  ),
  period_summary as (
    select count(*)::integer as created_count
    from public.tickets as ticket
    cross join bounds
    where ticket.timestamp >= bounds.start_at
      and ticket.timestamp < bounds.end_at
  ),
  points as materialized (
    select
      ticket.ticket_id,
      coalesce(nullif(btrim(ticket.subdistrict), ''), 'ไม่ระบุแขวง') as subdistrict,
      nullif(btrim(ticket.address), '') as address,
      ticket.state,
      ticket.lat::double precision as lat,
      ticket.lng::double precision as lng,
      st_transform(
        st_setsrid(st_makepoint(ticket.lng::double precision, ticket.lat::double precision), 4326),
        32647
      ) as projected
    from public.tickets as ticket
    cross join bounds
    where ticket.timestamp >= bounds.start_at
      and ticket.timestamp < bounds.end_at
      -- Keep the UTM 47N projection inside the Bangkok service region and
      -- reject sentinel/global coordinates such as 0,0.
      and ticket.lat between 13.3 and 14.2
      and ticket.lng between 100.2 and 101.1
  ),
  candidates as materialized (
    select
      center.ticket_id,
      center.lat,
      center.lng,
      center.projected,
      count(neighbor.ticket_id)::integer as nearby_count,
      count(neighbor.ticket_id) filter (
        where neighbor.state is null
          or neighbor.state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)')
      )::integer as nearby_pending_count
    from points as center
    join points as neighbor
      on abs(center.lat - neighbor.lat) <= (select radius_m / 110574.0 from bounds)
     and abs(center.lng - neighbor.lng) <= (
       select radius_m / (111320.0 * cos(radians(center.lat))) from bounds
     )
     and st_dwithin(center.projected, neighbor.projected, (select radius_m from bounds))
    group by center.ticket_id, center.lat, center.lng, center.projected
  ),
  selected_centers(selection_order, center_ticket_id, lat, lng, projected, selected_geometries) as (
    (
      select
        1,
        candidate.ticket_id,
        candidate.lat,
        candidate.lng,
        candidate.projected,
        array[candidate.projected]
      from candidates as candidate
      order by candidate.nearby_count desc, candidate.nearby_pending_count desc, candidate.ticket_id
      limit 1
    )
    union all
    select
      selected.selection_order + 1,
      next_candidate.ticket_id,
      next_candidate.lat,
      next_candidate.lng,
      next_candidate.projected,
      selected.selected_geometries || next_candidate.projected
    from selected_centers as selected
    cross join lateral (
      select candidate.*
      from candidates as candidate
      where not exists (
        select 1
        from unnest(selected.selected_geometries) as prior(projected)
        where st_dwithin(candidate.projected, prior.projected, (select 2.0 * radius_m from bounds))
      )
      order by candidate.nearby_count desc, candidate.nearby_pending_count desc, candidate.ticket_id
      limit 1
    ) as next_candidate
    where selected.selection_order < (select result_limit from bounds)
  ),
  assignment_candidates as (
    select
      point.ticket_id,
      point.subdistrict,
      point.address,
      point.state,
      center.selection_order,
      center.center_ticket_id,
      center.lat as center_lat,
      center.lng as center_lng,
      st_distance(point.projected, center.projected) as distance_m,
      row_number() over (
        partition by point.ticket_id
        order by st_distance(point.projected, center.projected), center.selection_order
      ) as assignment_rank
    from points as point
    join selected_centers as center
      on st_dwithin(point.projected, center.projected, (select radius_m from bounds))
  ),
  hotspots as (
    select
      assignment.center_ticket_id,
      mode() within group (order by assignment.subdistrict) as subdistrict,
      (
        array_agg(
          assignment.address
          order by
            case
              when assignment.address ~ '^แขวง[^ ]+ เขต[^ ]+ กรุงเทพมหานคร$' then 1
              else 0
            end,
            assignment.distance_m,
            assignment.ticket_id
        ) filter (where assignment.address is not null)
      )[1] as sample_address,
      round(max(assignment.center_lat)::numeric, 6) as lat,
      round(max(assignment.center_lng)::numeric, 6) as lng,
      count(*)::integer as total_count,
      count(*) filter (
        where assignment.state is null
          or assignment.state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)')
      )::integer as pending_count
    from assignment_candidates as assignment
    where assignment.assignment_rank = 1
    group by assignment.center_ticket_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'subdistrict', hotspot.subdistrict,
        'sampleAddress', hotspot.sample_address,
        'lat', hotspot.lat,
        'lng', hotspot.lng,
        'radiusMeters', bounds.radius_m,
        'totalCount', hotspot.total_count,
        'pendingCount', hotspot.pending_count,
        'closedCount', hotspot.total_count - hotspot.pending_count,
        'sharePercent', coalesce(
          round(100.0 * hotspot.total_count / nullif(period_summary.created_count, 0), 1),
          0
        )
      )
      order by hotspot.total_count desc, hotspot.pending_count desc, hotspot.center_ticket_id
    ),
    '[]'::jsonb
  )
  from hotspots as hotspot
  cross join bounds
  cross join period_summary;
$$;

revoke execute on function public.analytics_radius_hotspots(integer, integer, integer)
from public, anon, authenticated;

grant execute on function public.analytics_radius_hotspots(integer, integer, integer)
to service_role;

commit;
