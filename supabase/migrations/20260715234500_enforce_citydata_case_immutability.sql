begin;

-- Defense in depth for environments whose API schema cache may still retain
-- the retired RPC signature. Even if the route is discovered or invoked with a
-- service key, the function can no longer update CityData-derived fields.
create or replace function public.assign_ticket_departments(
  p_ticket_id text,
  p_departments text[],
  p_reason text,
  p_actor_role text,
  p_manual_override boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'ข้อมูลฝ่ายมาจาก CityData และไม่สามารถแก้ไขในระบบนี้ได้';
end;
$$;

revoke all on function public.assign_ticket_departments(text, text[], text, text, boolean)
from public, anon, authenticated, service_role;

commit;
