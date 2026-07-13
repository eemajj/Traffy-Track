alter table public.report_batch_items
  add column if not exists snapshot_captured_at timestamptz,
  add column if not exists snapshot_type text,
  add column if not exists snapshot_comment text,
  add column if not exists snapshot_address text,
  add column if not exists snapshot_subdistrict text,
  add column if not exists snapshot_timestamp timestamptz,
  add column if not exists snapshot_last_activity timestamptz,
  add column if not exists snapshot_state text,
  add column if not exists snapshot_org_response text;

comment on column public.report_batch_items.snapshot_captured_at is
  'When the ticket fields stored on this report item were captured. Null identifies a legacy item that needs live-ticket fallback.';

-- Historical report items did not carry ticket details. Preserve the best
-- available values now; this cannot reconstruct values from the original
-- report date, but it prevents subsequent ticket imports from changing them.
update public.report_batch_items as item
set
  snapshot_captured_at = now(),
  snapshot_type = ticket.type,
  snapshot_comment = ticket.comment,
  snapshot_address = ticket.address,
  snapshot_subdistrict = ticket.subdistrict,
  snapshot_timestamp = ticket.timestamp,
  snapshot_last_activity = ticket.last_activity,
  snapshot_state = ticket.state,
  snapshot_org_response = ticket.org_response
from public.tickets as ticket
where item.ticket_id = ticket.ticket_id
  and item.snapshot_captured_at is null;

create or replace function public.capture_report_batch_item_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.snapshot_captured_at is null then
    select
      ticket.type,
      ticket.comment,
      ticket.address,
      ticket.subdistrict,
      ticket.timestamp,
      ticket.last_activity,
      ticket.state,
      ticket.org_response
    into
      new.snapshot_type,
      new.snapshot_comment,
      new.snapshot_address,
      new.snapshot_subdistrict,
      new.snapshot_timestamp,
      new.snapshot_last_activity,
      new.snapshot_state,
      new.snapshot_org_response
    from public.tickets as ticket
    where ticket.ticket_id = new.ticket_id;

    if found then
      new.snapshot_captured_at = now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists capture_report_batch_item_snapshot on public.report_batch_items;
create trigger capture_report_batch_item_snapshot
before insert on public.report_batch_items
for each row
execute function public.capture_report_batch_item_snapshot();
