begin;

create table if not exists public.report_evidence_versions (
  id uuid primary key default gen_random_uuid(),
  report_batch_department_id uuid not null references public.report_batch_departments(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  object_path text not null unique check (btrim(object_path) <> ''),
  original_filename text,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  metadata_source text not null default 'verified_upload' check (metadata_source in ('verified_upload', 'legacy_unverified')),
  uploaded_at timestamptz not null default now(),
  uploaded_by_role text not null default 'system' check (uploaded_by_role in ('admin', 'operator', 'system')),
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected', 'legacy_unverified')),
  reviewed_at timestamptz,
  reviewed_by_role text check (reviewed_by_role is null or reviewed_by_role in ('admin', 'operator', 'system')),
  review_note text,
  withdrawn_at timestamptz,
  withdrawn_by_role text check (withdrawn_by_role is null or withdrawn_by_role in ('admin', 'operator', 'system')),
  withdrawal_reason text,
  check (
    metadata_source = 'legacy_unverified'
    or (nullif(btrim(original_filename), '') is not null and nullif(btrim(content_type), '') is not null and size_bytes is not null and sha256 is not null)
  ),
  unique (id, report_batch_department_id),
  unique (report_batch_department_id, version_number)
);

create index if not exists idx_report_evidence_versions_department_uploaded
  on public.report_evidence_versions (report_batch_department_id, uploaded_at desc);

create table if not exists public.report_evidence_status_events (
  id bigserial primary key,
  evidence_version_id uuid not null references public.report_evidence_versions(id) on delete cascade,
  status text not null check (status in ('submitted', 'approved', 'rejected', 'withdrawn')),
  note text,
  actor_role text not null check (actor_role in ('admin', 'operator', 'system')),
  occurred_at timestamptz not null default now()
);

create index if not exists idx_report_evidence_status_events_version_time
  on public.report_evidence_status_events (evidence_version_id, occurred_at desc, id desc);

create table if not exists public.report_evidence_upload_intents (
  id uuid primary key default gen_random_uuid(),
  report_batch_department_id uuid not null references public.report_batch_departments(id) on delete cascade,
  object_path text not null unique check (btrim(object_path) <> ''),
  original_filename text not null check (btrim(original_filename) <> ''),
  content_type text not null check (btrim(content_type) <> ''),
  expected_size_bytes bigint not null check (expected_size_bytes > 0),
  status text not null default 'pending' check (status in ('pending', 'attached', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attached_version_id uuid references public.report_evidence_versions(id) on delete set null
);

create index if not exists idx_report_evidence_upload_intents_expiry
  on public.report_evidence_upload_intents (status, expires_at);

create table if not exists public.storage_deletion_outbox (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (btrim(bucket) <> ''),
  object_path text not null check (btrim(object_path) <> ''),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  locked_until timestamptz,
  last_error text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (bucket, object_path)
);

create index if not exists idx_storage_deletion_outbox_claim
  on public.storage_deletion_outbox (status, next_attempt_at, requested_at);

alter table public.report_batch_departments
  add column if not exists current_evidence_version_id uuid,
  add column if not exists evidence_review_status text,
  add column if not exists evidence_version_number integer,
  add column if not exists evidence_original_filename text,
  add column if not exists evidence_sha256 text;

insert into public.report_evidence_versions (
  report_batch_department_id,
  version_number,
  object_path,
  original_filename,
  content_type,
  size_bytes,
  uploaded_at,
  uploaded_by_role,
  metadata_source,
  review_status,
  reviewed_at,
  reviewed_by_role,
  review_note
)
select
  department.id,
  1,
  department.evidence_file_url,
  null,
  null,
  null,
  coalesce(department.evidence_uploaded_at, now()),
  'system',
  'legacy_unverified',
  'legacy_unverified',
  null,
  null,
  'Migrated without checksum; requires review'
from public.report_batch_departments as department
where department.evidence_file_url is not null
on conflict (object_path) do nothing;

insert into public.report_evidence_status_events (evidence_version_id, status, note, actor_role, occurred_at)
select version.id, 'submitted', 'Migrated from legacy evidence pointer', 'system', version.uploaded_at
from public.report_evidence_versions as version
where version.metadata_source = 'legacy_unverified'
  and not exists (
    select 1 from public.report_evidence_status_events as event
    where event.evidence_version_id = version.id
  );

update public.report_batch_departments as department
set
  current_evidence_version_id = version.id,
  evidence_review_status = version.review_status,
  evidence_version_number = version.version_number,
  evidence_original_filename = version.original_filename,
  evidence_sha256 = version.sha256
from public.report_evidence_versions as version
where version.report_batch_department_id = department.id
  and version.object_path = department.evidence_file_url
  and department.current_evidence_version_id is null;

alter table public.report_batch_departments
  drop constraint if exists report_batch_departments_current_evidence_fk;

alter table public.report_batch_departments
  add constraint report_batch_departments_current_evidence_fk
  foreign key (current_evidence_version_id, id)
  references public.report_evidence_versions(id, report_batch_department_id)
  on delete set null;

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
  end if;

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

  return jsonb_build_object(
    'id', v_version.id,
    'versionNumber', v_version.version_number,
    'objectPath', v_version.object_path,
    'uploadedAt', v_version.uploaded_at,
    'reviewStatus', v_version.review_status,
    'originalFilename', v_version.original_filename,
    'sha256', v_version.sha256
  );
end;
$$;

create or replace function public.review_report_evidence_version(
  p_department_id uuid,
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
  v_version public.report_evidence_versions%rowtype;
begin
  if p_actor_role <> 'admin' then raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตรวจหลักฐานได้'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'ผลการตรวจหลักฐานไม่ถูกต้อง'; end if;

  select version.* into v_version
  from public.report_batch_departments as department
  join public.report_evidence_versions as version on version.id = department.current_evidence_version_id
  where department.id = p_department_id
  for update of version;

  if not found then raise exception 'ไม่พบหลักฐานปัจจุบันของฝ่าย'; end if;
  if v_version.withdrawn_at is not null then raise exception 'หลักฐานนี้ถูกถอนแล้ว'; end if;
  if v_version.review_status not in ('pending', 'legacy_unverified') then
    raise exception 'หลักฐานเวอร์ชันนี้มีผลตรวจสุดท้ายแล้ว กรุณาอัปโหลดเวอร์ชันใหม่หากต้องการแก้ไข';
  end if;

  insert into public.report_evidence_status_events (evidence_version_id, status, note, actor_role)
  values (v_version.id, p_decision, nullif(btrim(p_note), ''), p_actor_role);

  update public.report_evidence_versions
  set
    review_status = p_decision,
    reviewed_at = now(),
    reviewed_by_role = p_actor_role,
    review_note = nullif(btrim(p_note), '')
  where id = v_version.id
  returning * into v_version;

  update public.report_batch_departments
  set evidence_review_status = v_version.review_status
  where id = p_department_id and current_evidence_version_id = v_version.id;

  return jsonb_build_object(
    'id', v_version.id,
    'reviewStatus', v_version.review_status,
    'reviewedAt', v_version.reviewed_at,
    'reviewNote', v_version.review_note
  );
end;
$$;

create or replace function public.withdraw_report_evidence(
  p_department_id uuid,
  p_actor_role text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version public.report_evidence_versions%rowtype;
begin
  if p_actor_role not in ('admin', 'system') then raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่ถอนหลักฐานได้'; end if;

  select version.* into v_version
  from public.report_batch_departments as department
  join public.report_evidence_versions as version on version.id = department.current_evidence_version_id
  where department.id = p_department_id
  for update of department, version;

  if not found then raise exception 'ไม่พบไฟล์หลักฐาน'; end if;

  insert into public.report_evidence_status_events (evidence_version_id, status, note, actor_role)
  values (v_version.id, 'withdrawn', nullif(btrim(p_reason), ''), p_actor_role);

  update public.report_evidence_versions
  set
    withdrawn_at = coalesce(withdrawn_at, now()),
    withdrawn_by_role = coalesce(withdrawn_by_role, p_actor_role),
    withdrawal_reason = coalesce(withdrawal_reason, nullif(btrim(p_reason), ''))
  where id = v_version.id;

  update public.report_batch_departments
  set
    current_evidence_version_id = null,
    evidence_file_url = null,
    evidence_uploaded_at = null,
    evidence_review_status = null,
    evidence_version_number = null,
    evidence_original_filename = null,
    evidence_sha256 = null
  where id = p_department_id;

  insert into public.storage_deletion_outbox (bucket, object_path, reason)
  values ('report-evidence', v_version.object_path, 'evidence_withdrawn')
  on conflict (bucket, object_path) do update
  set status = 'pending', next_attempt_at = now(), updated_at = now(), last_error = null;

  return jsonb_build_object('id', v_version.id, 'objectPath', v_version.object_path);
end;
$$;

create or replace function public.enqueue_deleted_evidence_object()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.storage_deletion_outbox (bucket, object_path, reason)
  values ('report-evidence', old.object_path, 'evidence_record_deleted')
  on conflict (bucket, object_path) do update
  set status = 'pending', next_attempt_at = now(), updated_at = now(), last_error = null;
  return old;
end;
$$;

drop trigger if exists enqueue_deleted_evidence_object on public.report_evidence_versions;
create trigger enqueue_deleted_evidence_object
before delete on public.report_evidence_versions
for each row execute function public.enqueue_deleted_evidence_object();

create or replace function public.expire_evidence_upload_intents()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare v_count integer;
begin
  with expired as (
    update public.report_evidence_upload_intents
    set status = 'expired'
    where status = 'pending' and expires_at <= now()
    returning object_path
  ), queued as (
    insert into public.storage_deletion_outbox (bucket, object_path, reason)
    select 'report-evidence', object_path, 'upload_intent_expired' from expired
    on conflict (bucket, object_path) do update
    set status = 'pending', next_attempt_at = now(), updated_at = now(), last_error = null
    returning 1
  )
  select count(*) into v_count from queued;
  return v_count;
end;
$$;

create or replace function public.claim_storage_deletions(p_limit integer default 100)
returns table (id uuid, bucket text, object_path text, lease_token uuid, attempts integer)
language sql
security invoker
set search_path = public
as $$
  with candidates as (
    select job.id
    from public.storage_deletion_outbox as job
    where (
      job.status in ('pending', 'failed') and job.next_attempt_at <= now()
    ) or (
      job.status = 'processing' and job.locked_until < now()
    )
    order by job.requested_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ), claimed as (
    update public.storage_deletion_outbox as job
    set
      status = 'processing',
      attempts = job.attempts + 1,
      lease_token = gen_random_uuid(),
      locked_until = now() + interval '5 minutes',
      updated_at = now()
    from candidates
    where job.id = candidates.id
    returning job.id, job.bucket, job.object_path, job.lease_token, job.attempts
  )
  select * from claimed;
$$;

create or replace function public.complete_storage_deletion(p_id uuid, p_lease_token uuid)
returns boolean language sql security invoker set search_path = public as $$
  update public.storage_deletion_outbox
  set status = 'completed', completed_at = now(), locked_until = null, updated_at = now(), last_error = null
  where id = p_id and status = 'processing' and lease_token = p_lease_token
  returning true;
$$;

create or replace function public.fail_storage_deletion(p_id uuid, p_lease_token uuid, p_error text)
returns boolean language sql security invoker set search_path = public as $$
  update public.storage_deletion_outbox
  set
    status = 'failed',
    next_attempt_at = now() + least(interval '24 hours', interval '1 minute' * power(2, least(attempts, 10))),
    locked_until = null,
    updated_at = now(),
    last_error = left(coalesce(p_error, 'unknown storage error'), 1000)
  where id = p_id and status = 'processing' and lease_token = p_lease_token
  returning true;
$$;

create or replace function public.is_storage_object_referenced(p_bucket text, p_object_path text)
returns boolean language sql stable security invoker set search_path = public as $$
  select case when p_bucket = 'report-evidence' then exists (
    select 1 from public.report_evidence_versions
    where object_path = p_object_path and withdrawn_at is null
  ) else false end;
$$;

alter table public.report_evidence_versions enable row level security;
alter table public.report_evidence_status_events enable row level security;
alter table public.report_evidence_upload_intents enable row level security;
alter table public.storage_deletion_outbox enable row level security;

revoke all on public.report_evidence_versions, public.report_evidence_status_events, public.report_evidence_upload_intents, public.storage_deletion_outbox
from public, anon, authenticated;

revoke execute on function public.attach_report_evidence_version(uuid, text, bigint, text, text, text) from public, anon, authenticated;
revoke execute on function public.review_report_evidence_version(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.withdraw_report_evidence(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.expire_evidence_upload_intents() from public, anon, authenticated;
revoke execute on function public.claim_storage_deletions(integer) from public, anon, authenticated;
revoke execute on function public.complete_storage_deletion(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fail_storage_deletion(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.is_storage_object_referenced(text, text) from public, anon, authenticated;

grant select on public.report_evidence_versions, public.report_evidence_status_events to service_role;
revoke insert, update, delete on public.report_evidence_versions, public.report_evidence_status_events from service_role;
grant select, insert, update, delete on public.report_evidence_upload_intents, public.storage_deletion_outbox to service_role;
grant execute on function public.attach_report_evidence_version(uuid, text, bigint, text, text, text) to service_role;
grant execute on function public.review_report_evidence_version(uuid, text, text, text) to service_role;
grant execute on function public.withdraw_report_evidence(uuid, text, text) to service_role;
grant execute on function public.expire_evidence_upload_intents() to service_role;
grant execute on function public.claim_storage_deletions(integer) to service_role;
grant execute on function public.complete_storage_deletion(uuid, uuid) to service_role;
grant execute on function public.fail_storage_deletion(uuid, uuid, text) to service_role;
grant execute on function public.is_storage_object_referenced(text, text) to service_role;

commit;
