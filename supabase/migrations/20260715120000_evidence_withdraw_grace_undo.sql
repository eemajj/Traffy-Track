begin;

create or replace function public.delay_evidence_withdrawal_deletion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reason = 'evidence_withdrawn' and new.status = 'pending' then
    new.next_attempt_at := greatest(new.next_attempt_at, now() + interval '15 minutes');
  end if;
  return new;
end;
$$;

drop trigger if exists delay_evidence_withdrawal_deletion on public.storage_deletion_outbox;
create trigger delay_evidence_withdrawal_deletion
before insert or update of status, next_attempt_at, reason on public.storage_deletion_outbox
for each row execute function public.delay_evidence_withdrawal_deletion();

create or replace function public.undo_report_evidence_withdrawal(
  p_department_id uuid,
  p_evidence_version_id uuid,
  p_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_department public.report_batch_departments%rowtype;
  v_version public.report_evidence_versions%rowtype;
  v_outbox public.storage_deletion_outbox%rowtype;
  v_event_status text;
begin
  if p_actor_role <> 'admin' then
    raise sqlstate 'PT403' using message = 'เฉพาะผู้ดูแลระบบเท่านั้นที่ยกเลิกการถอนหลักฐานได้';
  end if;

  select * into v_department
  from public.report_batch_departments
  where id = p_department_id
  for update;
  if not found then raise sqlstate 'PT404' using message = 'ไม่พบฝ่ายในรอบรายงาน'; end if;
  if v_department.current_evidence_version_id is not null then
    raise sqlstate 'PT409' using message = 'ฝ่ายนี้มีหลักฐานปัจจุบันแล้ว จึงยกเลิกการถอนเวอร์ชันเก่าไม่ได้';
  end if;

  select * into v_version
  from public.report_evidence_versions
  where id = p_evidence_version_id
    and report_batch_department_id = p_department_id
  for update;
  if not found or v_version.withdrawn_at is null then
    raise sqlstate 'PT409' using message = 'หลักฐานเวอร์ชันนี้ไม่ได้อยู่ในสถานะถอน';
  end if;

  select * into v_outbox
  from public.storage_deletion_outbox
  where bucket = 'report-evidence'
    and object_path = v_version.object_path
    and reason = 'evidence_withdrawn'
  for update;

  if not found or v_outbox.status <> 'pending' or v_outbox.next_attempt_at <= now() then
    raise sqlstate 'PT409' using message = 'หมดเวลายกเลิก หรือ worker เริ่มลบไฟล์แล้ว';
  end if;

  delete from public.storage_deletion_outbox where id = v_outbox.id;

  update public.report_evidence_versions
  set withdrawn_at = null, withdrawn_by_role = null, withdrawal_reason = null
  where id = v_version.id;

  v_event_status := case
    when v_version.review_status in ('approved', 'rejected') then v_version.review_status
    else 'submitted'
  end;
  insert into public.report_evidence_status_events (evidence_version_id, status, note, actor_role)
  values (v_version.id, v_event_status, 'ยกเลิกการถอนหลักฐานภายในช่วง grace period', p_actor_role);

  update public.report_batch_departments
  set current_evidence_version_id = v_version.id,
      evidence_file_url = v_version.object_path,
      evidence_uploaded_at = v_version.uploaded_at,
      evidence_review_status = v_version.review_status,
      evidence_version_number = v_version.version_number,
      evidence_original_filename = v_version.original_filename,
      evidence_sha256 = v_version.sha256
  where id = p_department_id;

  update public.report_batch_departments
  set evidence_review_note = v_version.review_note
  where id = p_department_id;

  return jsonb_build_object(
    'id', v_version.id,
    'objectPath', v_version.object_path,
    'reviewStatus', v_version.review_status,
    'versionNumber', v_version.version_number,
    'originalFilename', v_version.original_filename,
    'uploadedAt', v_version.uploaded_at
  );
end;
$$;

revoke execute on function public.undo_report_evidence_withdrawal(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.undo_report_evidence_withdrawal(uuid, uuid, text)
to service_role;

commit;
