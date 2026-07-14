begin;

create or replace function public.withdraw_report_evidence_v2(
  p_department_id uuid,
  p_evidence_version_id uuid,
  p_actor_role text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department public.report_batch_departments%rowtype;
  v_version public.report_evidence_versions%rowtype;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if p_actor_role not in ('admin', 'system') then
    raise sqlstate 'PT403' using message = 'เฉพาะผู้ดูแลระบบเท่านั้นที่ถอนหลักฐานได้';
  end if;
  if v_reason is null or char_length(v_reason) < 5 then
    raise sqlstate 'PT400' using message = 'กรุณาระบุเหตุผลที่ถอนหลักฐานอย่างน้อย 5 ตัวอักษร';
  end if;
  if char_length(v_reason) > 1000 then
    raise sqlstate 'PT400' using message = 'เหตุผลที่ถอนหลักฐานต้องไม่เกิน 1,000 ตัวอักษร';
  end if;

  select * into v_department
  from public.report_batch_departments
  where id = p_department_id
  for update;

  if not found then
    raise sqlstate 'PT404' using message = 'ไม่พบฝ่ายในรอบรายงาน';
  end if;

  if v_department.current_evidence_version_id is null then
    select * into v_version
    from public.report_evidence_versions
    where id = p_evidence_version_id
      and report_batch_department_id = p_department_id;

    if found and v_version.withdrawn_at is not null then
      return jsonb_build_object(
        'id', v_version.id,
        'objectPath', v_version.object_path,
        'idempotent', true
      );
    end if;

    raise sqlstate 'PT409' using message = 'ฝ่ายนี้ไม่มีหลักฐานปัจจุบันแล้ว กรุณาโหลดข้อมูลใหม่';
  end if;

  if v_department.current_evidence_version_id <> p_evidence_version_id then
    raise sqlstate 'PT409' using message = 'มีหลักฐานเวอร์ชันใหม่แล้ว กรุณาโหลดข้อมูลล่าสุดก่อนถอน';
  end if;

  select * into v_version
  from public.report_evidence_versions
  where id = p_evidence_version_id
    and report_batch_department_id = p_department_id
  for update;

  if not found or v_version.withdrawn_at is not null then
    raise sqlstate 'PT409' using message = 'หลักฐานเวอร์ชันนี้ถูกถอนหรือเปลี่ยนไปแล้ว';
  end if;

  insert into public.report_evidence_status_events
    (evidence_version_id, status, note, actor_role)
  values
    (v_version.id, 'withdrawn', v_reason, p_actor_role);

  update public.report_evidence_versions
  set
    withdrawn_at = now(),
    withdrawn_by_role = p_actor_role,
    withdrawal_reason = v_reason
  where id = v_version.id;

  update public.report_batch_departments
  set
    current_evidence_version_id = null,
    evidence_file_url = null,
    evidence_uploaded_at = null,
    evidence_review_status = null,
    evidence_review_note = null,
    evidence_version_number = null,
    evidence_original_filename = null,
    evidence_sha256 = null
  where id = p_department_id
    and current_evidence_version_id = v_version.id;

  insert into public.storage_deletion_outbox (bucket, object_path, reason)
  values ('report-evidence', v_version.object_path, 'evidence_withdrawn')
  on conflict (bucket, object_path) do update
  set
    status = 'pending',
    next_attempt_at = now(),
    updated_at = now(),
    last_error = null;

  return jsonb_build_object(
    'id', v_version.id,
    'objectPath', v_version.object_path,
    'idempotent', false
  );
end;
$$;

revoke execute on function public.withdraw_report_evidence_v2(uuid, uuid, text, text)
from public, anon, authenticated;

grant execute on function public.withdraw_report_evidence_v2(uuid, uuid, text, text)
to service_role;

-- The application has moved to exact-version lifecycle RPCs. Keeping the old
-- functions defined helps inspect legacy migrations, but they must no longer be
-- executable by the server role because they cannot provide stale-write safety.
revoke execute on function public.review_report_evidence_version(uuid, text, text, text)
from service_role;

revoke execute on function public.withdraw_report_evidence(uuid, text, text)
from service_role;

commit;
