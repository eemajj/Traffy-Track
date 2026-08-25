-- Stage 2.1 (Decision D2): tag every ticket with the source channel that
-- brought it into the system.
--
--   external_intake       - the case carries NO district signal at all
--                           (no district department, no district keyword in
--                           org_list, not geofenced to the district). It only
--                           entered via the upstream intake filter.
--   district_transferred  - everything else (district-owned or transferred).
--
-- Derivation happens inside the import apply RPCs so the flag always reflects
-- the payload at import time. Dashboard separation reads this flag afterwards.

begin;

alter table public.tickets add column if not exists ticket_origin text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tickets_ticket_origin_check'
  ) then
    alter table public.tickets
      add constraint tickets_ticket_origin_check
      check (ticket_origin in ('external_intake', 'district_transferred'));
  end if;
end;
$$;

-- Mirrors the district-signal rules of isDistrictRelatedTicket() in
-- lib/import/normalize.ts. Kept immutable so it can be reused in queries.
create or replace function public.derive_ticket_origin(
  p_org_list text[],
  p_dept_list text[],
  p_district text,
  p_state text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_org_entry text;
begin
  if p_dept_list is not null and array_length(p_dept_list, 1) > 0 then
    return 'district_transferred';
  end if;

  if p_org_list is not null then
    foreach v_org_entry in array p_org_list loop
      if v_org_entry like '%ทวีวัฒนา%' or left(v_org_entry, char_length('ฝ่าย')) = 'ฝ่าย' then
        return 'district_transferred';
      end if;
    end loop;
  end if;

  if p_district is not null and p_district like '%ทวีวัฒนา%' then
    return 'district_transferred';
  end if;

  return 'external_intake';
end;
$$;

-- Known limitation (accepted in docs/REMEDIATION-PLAN.md): historical rows are
-- classified from their CURRENT fields, not their fields at original import time.
update public.tickets
set ticket_origin = public.derive_ticket_origin(org_list, dept_list, district, state)
where ticket_origin is null;

create index if not exists idx_tickets_external_intake
  on public.tickets (last_activity desc)
  where ticket_origin = 'external_intake';

-- Re-apply the durable-consumer apply RPC with origin-aware upsert.
create or replace function public.apply_claimed_import_batch(
  p_import_batch_id uuid,
  p_lease_token uuid,
  p_tickets jsonb,
  p_history jsonb,
  p_total_rows integer,
  p_processed_rows integer,
  p_duplicate_rows integer,
  p_new_tickets integer,
  p_reopened_tickets integer,
  p_changed_tickets integer,
  p_unchanged_tickets integer,
  p_changed_fields integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform 1
  from public.import_batches
  where id = p_import_batch_id
    and status = 'running'
    and lease_token = p_lease_token
    and locked_until >= now()
  for update;

  if not found then
    raise exception 'Import batch % lease is no longer valid', p_import_batch_id;
  end if;

  insert into public.tickets (
    ticket_id, type, comment, photo_url, address, subdistrict, district,
    province, timestamp, last_activity, state, org_response, org_list,
    dept_list, star, hashtag, lat, lng, ticket_origin
  )
  select
    ticket_id, type, comment, photo_url, address, subdistrict, district,
    province, timestamp, last_activity, state, org_response, org_list,
    dept_list, star, hashtag, lat, lng,
    public.derive_ticket_origin(org_list, dept_list, district, state)
  from jsonb_to_recordset(coalesce(p_tickets, '[]'::jsonb)) as rows(
    ticket_id text, type text, comment text, photo_url text, address text,
    subdistrict text, district text, province text, timestamp timestamptz,
    last_activity timestamptz, state text, org_response text, org_list text[],
    dept_list text[], star integer, hashtag text, lat numeric, lng numeric
  )
  on conflict (ticket_id) do update set
    type = excluded.type,
    comment = excluded.comment,
    photo_url = excluded.photo_url,
    address = excluded.address,
    subdistrict = excluded.subdistrict,
    district = excluded.district,
    province = excluded.province,
    timestamp = excluded.timestamp,
    last_activity = excluded.last_activity,
    state = excluded.state,
    org_response = excluded.org_response,
    org_list = excluded.org_list,
    dept_list = excluded.dept_list,
    star = excluded.star,
    hashtag = excluded.hashtag,
    lat = excluded.lat,
    lng = excluded.lng,
    ticket_origin = excluded.ticket_origin;

  insert into public.ticket_history (
    ticket_id, changed_field, old_value, new_value, import_batch_id
  )
  select ticket_id, changed_field, old_value, new_value, import_batch_id
  from jsonb_to_recordset(coalesce(p_history, '[]'::jsonb)) as rows(
    ticket_id text,
    changed_field text,
    old_value text,
    new_value text,
    import_batch_id uuid
  );

  update public.import_batches
  set
    total_rows = p_total_rows,
    processed_rows = p_processed_rows,
    duplicate_rows = p_duplicate_rows,
    new_tickets = p_new_tickets,
    reopened_tickets = p_reopened_tickets,
    changed_tickets = p_changed_tickets,
    unchanged_tickets = p_unchanged_tickets,
    changed_fields = p_changed_fields,
    status = 'completed',
    error_message = null,
    completed_at = now(),
    lease_token = null,
    locked_until = null,
    heartbeat_at = now()
  where id = p_import_batch_id;
end;
$$;

revoke execute on function public.apply_claimed_import_batch(
  uuid, uuid, jsonb, jsonb, integer, integer, integer, integer, integer,
  integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.apply_claimed_import_batch(
  uuid, uuid, jsonb, jsonb, integer, integer, integer, integer, integer,
  integer, integer, integer
) to service_role;

commit;