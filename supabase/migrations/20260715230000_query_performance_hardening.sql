begin;

-- Time-window analytics and focused map queries filter tickets by timestamp.
create index if not exists idx_tickets_timestamp_desc
  on public.tickets (timestamp desc)
  where timestamp is not null;

-- The dashboard and case register repeatedly request pending tickets ordered by
-- their latest activity. Keep the index small by excluding terminal states.
create index if not exists idx_tickets_pending_last_activity
  on public.tickets (last_activity desc nulls last, ticket_id)
  where state is null
     or state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)');

-- The workflow action centre and report-creation gate repeatedly find pending
-- tickets without an assigned department.
create index if not exists idx_tickets_pending_unassigned
  on public.tickets (first_seen_at, ticket_id)
  where (state is null
      or state not in ('เสร็จสิ้น', 'ไม่เกี่ยวข้อง', 'ส่งต่อ(ใหม่)'))
    and coalesce(cardinality(dept_list), 0) = 0;

-- Latest completed import is read on most operational pages.
create index if not exists idx_import_batches_completed_latest
  on public.import_batches (imported_at desc, id)
  where status = 'completed';

-- Operational notifications and the action centre look for active reports by
-- due date. Locked reports are intentionally excluded from this index.
create index if not exists idx_report_batches_active_due_date
  on public.report_batches (due_date, created_at, id)
  where lifecycle_status <> 'locked';

-- Focused map queries first narrow by date and then by the canonical coordinate
-- bounds. This index avoids adding a generated spatial column immediately before
-- release while still reducing rows entering the PostGIS calculation.
create index if not exists idx_tickets_timestamp_coordinates
  on public.tickets (timestamp desc, lat, lng)
  where timestamp is not null and lat is not null and lng is not null;

commit;
