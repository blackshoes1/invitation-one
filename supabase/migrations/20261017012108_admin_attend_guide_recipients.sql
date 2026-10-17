-- 그룹·개별 초대에서 명시적으로 참석 등록/변경한 사람은 사전 안내 대상(rsvp.attending=true)이 된다.
-- 기존 참석 RSVP 를 연결할 때는 응답·개인 안내·체크인 정보를 보존한다.
-- 불참 → 참석 전환 시 기존 안내 링크는 기존 트리거가 폐기하며, 새 안내를 준비할 수 있다.
-- 선행: 20261007000300_admin_attend_update.sql

begin;

create or replace function public.admin_attend_member_v1(
  p_group uuid,
  p_member uuid,
  p_side text,
  p_phone text,
  p_companions int,
  p_names text[]
)
returns table (result text, rsvp_id uuid)
language plpgsql security invoker set search_path = ''
as $$
declare
  m public.group_members;
  r public.rsvp;
  v_id uuid;
  v_phone text;
  v_count int := least(19, greatest(0, coalesce(p_companions, 0)));
begin
  if p_side is null or p_side not in ('groom', 'bride') then
    raise exception 'invalid_side';
  end if;

  select * into m from public.group_members
   where id = p_member and group_id is not distinct from p_group for update;
  if not found then raise exception 'member_not_found'; end if;
  v_phone := coalesce(nullif(btrim(p_phone), ''), nullif(btrim(m.phone), ''));
  if m.rsvp_id is not null then
    select * into r from public.rsvp where id = m.rsvp_id for update;
    if r.attending then raise exception 'already_registered'; end if;
    v_phone := coalesce(nullif(btrim(m.phone), ''), r.phone);
  elsif v_phone is not null then
    select * into r from public.rsvp where name = btrim(m.name) and phone = v_phone for update;
  end if;

  if r.id is not null then
    -- 명시적인 참석 등록만 불참 응답을 전환한다. 일반 인원 수정은 기존 불참 검증을 유지한다.
    if not r.attending then
      update public.rsvp set
        attending = true,
        phone = v_phone,
        side = p_side,
        companion_count = v_count,
        companion_names = coalesce(p_names, '{}'),
        children = least(r.children, v_count),
        updated_at = now()
      where id = r.id;
    end if;
    update public.group_members set rsvp_id = r.id, phone = coalesce(v_phone, r.phone) where id = m.id;
    return query select 'linked'::text, r.id;
    return;
  end if;

  insert into public.rsvp (
    name, phone, side, attending, companion_count, companion_names,
    children, kids_meal, eating,
    checkin_token, checkin_token_active, qr_issued_at
  ) values (
    btrim(m.name), v_phone, p_side, true, v_count, coalesce(p_names, '{}'),
    0, false, 'yes',
    gen_random_uuid(), true, now()
  ) returning id into v_id;

  update public.group_members set rsvp_id = v_id, phone = v_phone where id = m.id;
  return query select 'created'::text, v_id;
end;
$$;

revoke all on function public.admin_attend_member_v1(uuid, uuid, text, text, int, text[])
  from public, anon, authenticated;
grant execute on function public.admin_attend_member_v1(uuid, uuid, text, text, int, text[])
  to service_role;

commit;
