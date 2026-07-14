begin;

-- Apply one import's data and summary as a single database transaction.
-- The function is intentionally callable only by the server's service role.
create or replace function public.apply_import_batch(
  p_import_batch_id uuid,
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
  insert into public.tickets (
    ticket_id, type, comment, photo_url, address, subdistrict, district,
    province, timestamp, last_activity, state, org_response, org_list,
    dept_list, star, hashtag, lat, lng
  )
  select
    ticket_id, type, comment, photo_url, address, subdistrict, district,
    province, timestamp, last_activity, state, org_response, org_list,
    dept_list, star, hashtag, lat, lng
  from jsonb_to_recordset(coalesce(p_tickets, '[]'::jsonb)) as rows(
    ticket_id text,
    type text,
    comment text,
    photo_url text,
    address text,
    subdistrict text,
    district text,
    province text,
    timestamp timestamptz,
    last_activity timestamptz,
    state text,
    org_response text,
    org_list text[],
    dept_list text[],
    star integer,
    hashtag text,
    lat numeric,
    lng numeric
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
    lng = excluded.lng;

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
    completed_at = now()
  where id = p_import_batch_id;

  if not found then
    raise exception 'Import batch % does not exist', p_import_batch_id;
  end if;
end;
$$;

revoke execute on function public.apply_import_batch(
  uuid, jsonb, jsonb, integer, integer, integer, integer, integer,
  integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.apply_import_batch(
  uuid, jsonb, jsonb, integer, integer, integer, integer, integer,
  integer, integer, integer
) to service_role;

commit;
