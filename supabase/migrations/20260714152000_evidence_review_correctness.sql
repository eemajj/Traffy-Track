begin;

alter table public.report_batch_departments
  add column if not exists evidence_review_note text;

alter table public.report_evidence_versions
  add constraint report_evidence_versions_rejection_reason_required
  check (review_status <> 'rejected' or nullif(btrim(review_note), '') is not null)
  not valid;

alter table public.report_evidence_status_events
  add constraint report_evidence_status_events_rejection_reason_required
  check (status <> 'rejected' or nullif(btrim(note), '') is not null)
  not valid;

alter table public.report_archives
  add column if not exists completion_semantics text not null default 'legacy_uploaded_v0',
  add column if not exists evidence_missing_count integer,
  add column if not exists evidence_pending_review_count integer,
  add column if not exists evidence_rejected_count integer,
  add column if not exists evidence_approved_count integer;

alter table public.report_archives
  add constraint report_archives_completion_semantics_check
  check (completion_semantics in ('legacy_uploaded_v0', 'approved_v1')) not valid,
  add constraint report_archives_semantic_counts_check
  check (
    (evidence_missing_count is null or evidence_missing_count >= 0)
    and (evidence_pending_review_count is null or evidence_pending_review_count >= 0)
    and (evidence_rejected_count is null or evidence_rejected_count >= 0)
    and (evidence_approved_count is null or evidence_approved_count >= 0)
  ) not valid,
  add constraint report_archives_approved_v1_counts_complete
  check (
    completion_semantics <> 'approved_v1'
    or (
      evidence_missing_count is not null
      and evidence_pending_review_count is not null
      and evidence_rejected_count is not null
      and evidence_approved_count is not null
      and evidence_missing_count + evidence_pending_review_count
          + evidence_rejected_count + evidence_approved_count = department_count
      and completion_status = case
        when department_count > 0 and evidence_approved_count = department_count
        then 'complete' else 'incomplete' end
    )
  ) not valid;

create or replace function public.clear_evidence_review_projection_on_version_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.current_evidence_version_id is distinct from old.current_evidence_version_id then
    new.evidence_review_note := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_evidence_review_projection_on_version_change
on public.report_batch_departments;

create trigger clear_evidence_review_projection_on_version_change
before update of current_evidence_version_id on public.report_batch_departments
for each row execute function public.clear_evidence_review_projection_on_version_change();

-- A delayed retry for an already-attached intent must never repoint the
-- department from a newer version back to the older version.
create or replace function public.attach_report_evidence_version(
  p_department_id uuid,
  p_object_path text,
  p_actual_size_bytes bigint,
  p_detected_content_type text,
  p_sha256 text,
  p_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department public.report_batch_departments%rowtype;
  v_intent public.report_evidence_upload_intents%rowtype;
  v_version public.report_evidence_versions%rowtype;
  v_next_version integer;
  v_idempotent boolean := false;
begin
  if p_actor_role not in ('admin', 'operator', 'system') then
    raise exception 'บทบาทผู้บันทึกหลักฐานไม่ถูกต้อง';
  end if;

  select * into v_department
  from public.report_batch_departments
  where id = p_department_id
  for update;
  if not found then raise exception 'ไม่พบฝ่ายในรอบรายงาน'; end if;

  select * into v_intent
  from public.report_evidence_upload_intents
  where object_path = p_object_path
    and report_batch_department_id = p_department_id
  for update;
  if not found then raise exception 'ไม่พบ upload intent ของไฟล์หลักฐาน'; end if;

  if v_intent.status = 'attached' then
    select * into v_version
    from public.report_evidence_versions
    where id = v_intent.attached_version_id;
    if not found then raise exception 'upload intent อ้างถึงเวอร์ชันหลักฐานที่ไม่พบ'; end if;
    v_idempotent := true;
  else
    if v_intent.status <> 'pending' or v_intent.expires_at <= now() then
      raise exception 'upload intent หมดอายุหรือใช้งานแล้ว';
    end if;
    if p_actual_size_bytes <> v_intent.expected_size_bytes then
      raise exception 'ขนาดไฟล์หลักฐานไม่ตรงกับ upload intent';
    end if;
    if p_detected_content_type <> v_intent.content_type then
      raise exception 'ชนิดไฟล์จริงไม่ตรงกับ upload intent';
    end if;
    if p_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception 'checksum ของไฟล์หลักฐานไม่ถูกต้อง';
    end if;

    select coalesce(max(version_number), 0) + 1 into v_next_version
    from public.report_evidence_versions
    where report_batch_department_id = p_department_id;

    insert into public.report_evidence_versions (
      report_batch_department_id, version_number, object_path, original_filename,
      content_type, size_bytes, sha256, uploaded_by_role, metadata_source
    ) values (
      p_department_id, v_next_version, p_object_path, v_intent.original_filename,
      v_intent.content_type, p_actual_size_bytes, lower(p_sha256), p_actor_role, 'verified_upload'
    ) returning * into v_version;

    insert into public.report_evidence_status_events (evidence_version_id, status, actor_role)
    values (v_version.id, 'submitted', p_actor_role);

    update public.report_evidence_upload_intents
    set status = 'attached', attached_version_id = v_version.id
    where id = v_intent.id;

    update public.report_batch_departments
    set
      current_evidence_version_id = v_version.id,
      evidence_file_url = v_version.object_path,
      evidence_uploaded_at = v_version.uploaded_at,
      evidence_review_status = v_version.review_status,
      evidence_version_number = v_version.version_number,
      evidence_original_filename = v_version.original_filename,
      evidence_sha256 = v_version.sha256
    where id = p_department_id;
  end if;

  return jsonb_build_object(
    'id', v_version.id,
    'versionNumber', v_version.version_number,
    'objectPath', v_version.object_path,
    'uploadedAt', v_version.uploaded_at,
    'reviewStatus', v_version.review_status,
    'originalFilename', v_version.original_filename,
    'sha256', v_version.sha256,
    'idempotent', v_idempotent
  );
end;
$$;

-- Keep the v1 RPC during rolling deployment. New application instances use v2,
-- which binds the decision to the exact version the reviewer opened.
create or replace function public.review_report_evidence_version_v2(
  p_department_id uuid,
  p_evidence_version_id uuid,
  p_decision text,
  p_note text,
  p_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department public.report_batch_departments%rowtype;
  v_version public.report_evidence_versions%rowtype;
  v_note text := nullif(btrim(p_note), '');
begin
  if p_actor_role <> 'admin' then
    raise sqlstate 'PT403' using message = 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตรวจหลักฐานได้';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise sqlstate 'PT400' using message = 'ผลการตรวจหลักฐานไม่ถูกต้อง';
  end if;
  if p_decision = 'rejected' and (v_note is null or char_length(v_note) < 5) then
    raise sqlstate 'PT400' using message = 'กรุณาระบุเหตุผลที่ตีกลับอย่างน้อย 5 ตัวอักษร';
  end if;
  if char_length(coalesce(v_note, '')) > 1000 then
    raise sqlstate 'PT400' using message = 'เหตุผลหรือหมายเหตุต้องไม่เกิน 1,000 ตัวอักษร';
  end if;

  select * into v_department
  from public.report_batch_departments
  where id = p_department_id
  for update;

  if not found then
    raise sqlstate 'PT404' using message = 'ไม่พบฝ่ายในรอบรายงาน';
  end if;
  if v_department.current_evidence_version_id is null then
    raise sqlstate 'PT409' using message = 'ฝ่ายนี้ไม่มีหลักฐานปัจจุบันแล้ว กรุณาโหลดข้อมูลใหม่';
  end if;
  if v_department.current_evidence_version_id <> p_evidence_version_id then
    raise sqlstate 'PT409' using message = 'มีหลักฐานเวอร์ชันใหม่แล้ว กรุณาโหลดข้อมูลล่าสุดและตรวจอีกครั้ง';
  end if;

  select * into v_version
  from public.report_evidence_versions
  where id = p_evidence_version_id
    and report_batch_department_id = p_department_id
  for update;

  if not found or v_version.withdrawn_at is not null then
    raise sqlstate 'PT409' using message = 'หลักฐานเวอร์ชันนี้ไม่ใช่เวอร์ชันที่ตรวจได้แล้ว';
  end if;

  if v_version.review_status = p_decision then
    return jsonb_build_object(
      'id', v_version.id,
      'reviewStatus', v_version.review_status,
      'reviewedAt', v_version.reviewed_at,
      'reviewNote', v_version.review_note,
      'idempotent', true
    );
  end if;
  if v_version.review_status not in ('pending', 'legacy_unverified') then
    raise sqlstate 'PT409' using message = 'หลักฐานเวอร์ชันนี้มีผลตรวจสุดท้ายแล้ว';
  end if;

  insert into public.report_evidence_status_events (evidence_version_id, status, note, actor_role)
  values (v_version.id, p_decision, v_note, p_actor_role);

  update public.report_evidence_versions
  set
    review_status = p_decision,
    reviewed_at = now(),
    reviewed_by_role = p_actor_role,
    review_note = v_note
  where id = v_version.id
  returning * into v_version;

  update public.report_batch_departments
  set
    evidence_review_status = v_version.review_status,
    evidence_review_note = v_version.review_note
  where id = p_department_id
    and current_evidence_version_id = v_version.id;

  return jsonb_build_object(
    'id', v_version.id,
    'reviewStatus', v_version.review_status,
    'reviewedAt', v_version.reviewed_at,
    'reviewNote', v_version.review_note,
    'idempotent', false
  );
end;
$$;

create or replace view public.report_batch_evidence_rollup
with (security_invoker = true)
as
select
  batch.id as report_batch_id,
  count(department.id)::integer as department_count,
  count(version.id)::integer as evidence_uploaded_count,
  count(version.id) filter (where version.review_status = 'approved')::integer as evidence_approved_count,
  count(version.id) filter (where version.review_status in ('pending', 'legacy_unverified'))::integer as evidence_pending_review_count,
  count(version.id) filter (where version.review_status = 'rejected')::integer as evidence_rejected_count,
  count(department.id) filter (where version.id is null)::integer as evidence_missing_count,
  case
    when count(department.id) > 0
      and count(version.id) filter (where version.review_status = 'approved') = count(department.id)
    then 'complete'
    else 'incomplete'
  end as completion_status
from public.report_batches as batch
left join public.report_batch_departments as department
  on department.report_batch_id = batch.id
left join public.report_evidence_versions as version
  on version.id = department.current_evidence_version_id
  and version.report_batch_department_id = department.id
  and version.withdrawn_at is null
group by batch.id;

revoke all on public.report_batch_evidence_rollup from public, anon, authenticated;
grant select on public.report_batch_evidence_rollup to service_role;
revoke execute on function public.review_report_evidence_version_v2(uuid, uuid, text, text, text)
from public, anon, authenticated;
grant execute on function public.review_report_evidence_version_v2(uuid, uuid, text, text, text)
to service_role;

commit;
