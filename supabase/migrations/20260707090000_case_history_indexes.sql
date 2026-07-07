create index if not exists idx_ticket_history_batch_field_detected
on public.ticket_history (import_batch_id, changed_field, detected_at desc);

create index if not exists idx_ticket_history_ticket_detected
on public.ticket_history (ticket_id, detected_at desc);
