begin;

-- Evidence versions and lifecycle events are immutable to service_role. Restore
-- them through one narrowly-scoped transaction instead of temporarily granting
-- direct DML privileges back to the application role.
create or replace function public.restore_report_evidence_snapshot(
  p_versions jsonb,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version_count integer := 0;
  v_event_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtext('restore_report_evidence_snapshot'));

  if jsonb_typeof(coalesce(p_versions, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_events, '[]'::jsonb)) <> 'array' then
    raise exception 'Evidence restore payloads must be JSON arrays';
  end if;

  -- This RPC is only for a full restore after report batches/departments have
  -- been recreated. Refuse to merge into live evidence history.
  if exists (select 1 from public.report_evidence_versions limit 1)
    or exists (select 1 from public.report_evidence_status_events limit 1) then
    raise exception 'Evidence restore requires empty evidence history tables';
  end if;

  -- Deleting report departments during the restore queues their former object
  -- paths. Lock those exact jobs so a concurrent claimant must skip them. A job
  -- that was already claimed may be deleting the blob outside PostgreSQL, so
  -- fail closed and let the operator retry after that lease finishes.
  perform 1
  from public.storage_deletion_outbox as job
  where job.bucket = 'report-evidence'
    and job.object_path in (
      select restored.object_path
      from jsonb_to_recordset(coalesce(p_versions, '[]'::jsonb)) as restored (object_path text)
    )
  for update;

  if exists (
    select 1
    from public.storage_deletion_outbox as job
    where job.bucket = 'report-evidence'
      and job.status = 'processing'
      and job.object_path in (
        select restored.object_path
        from jsonb_to_recordset(coalesce(p_versions, '[]'::jsonb)) as restored (object_path text)
      )
  ) then
    raise exception 'Evidence restore paths are currently being deleted; retry after the storage deletion lease finishes';
  end if;

  delete from public.storage_deletion_outbox as job
  where job.bucket = 'report-evidence'
    and job.object_path in (
      select restored.object_path
      from jsonb_to_recordset(coalesce(p_versions, '[]'::jsonb)) as restored (object_path text)
    );

  insert into public.report_evidence_versions (
    id,
    report_batch_department_id,
    version_number,
    object_path,
    original_filename,
    content_type,
    size_bytes,
    sha256,
    metadata_source,
    uploaded_at,
    uploaded_by_role,
    review_status,
    reviewed_at,
    reviewed_by_role,
    review_note,
    withdrawn_at,
    withdrawn_by_role,
    withdrawal_reason
  )
  select
    restored.id,
    restored.report_batch_department_id,
    restored.version_number,
    restored.object_path,
    restored.original_filename,
    restored.content_type,
    restored.size_bytes,
    restored.sha256,
    restored.metadata_source,
    restored.uploaded_at,
    restored.uploaded_by_role,
    restored.review_status,
    restored.reviewed_at,
    restored.reviewed_by_role,
    restored.review_note,
    restored.withdrawn_at,
    restored.withdrawn_by_role,
    restored.withdrawal_reason
  from jsonb_to_recordset(coalesce(p_versions, '[]'::jsonb)) as restored (
    id uuid,
    report_batch_department_id uuid,
    version_number integer,
    object_path text,
    original_filename text,
    content_type text,
    size_bytes bigint,
    sha256 text,
    metadata_source text,
    uploaded_at timestamptz,
    uploaded_by_role text,
    review_status text,
    reviewed_at timestamptz,
    reviewed_by_role text,
    review_note text,
    withdrawn_at timestamptz,
    withdrawn_by_role text,
    withdrawal_reason text
  );
  get diagnostics v_version_count = row_count;

  insert into public.report_evidence_status_events (
    id,
    evidence_version_id,
    status,
    note,
    actor_role,
    occurred_at
  )
  select
    restored.id,
    restored.evidence_version_id,
    restored.status,
    restored.note,
    restored.actor_role,
    restored.occurred_at
  from jsonb_to_recordset(coalesce(p_events, '[]'::jsonb)) as restored (
    id bigint,
    evidence_version_id uuid,
    status text,
    note text,
    actor_role text,
    occurred_at timestamptz
  );
  get diagnostics v_event_count = row_count;

  if v_event_count > 0 then
    perform setval(
      pg_get_serial_sequence('public.report_evidence_status_events', 'id'),
      (select max(id) from public.report_evidence_status_events),
      true
    );
  end if;

  return jsonb_build_object(
    'versions', v_version_count,
    'events', v_event_count
  );
end;
$$;

revoke execute on function public.restore_report_evidence_snapshot(jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.restore_report_evidence_snapshot(jsonb, jsonb)
to service_role;

commit;
