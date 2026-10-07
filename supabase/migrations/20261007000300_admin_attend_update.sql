-- 참석 등록 확장
--  1) admin_attend_member_v1 : 그룹에 속하지 않은 개별 초대(group_id is null)도 등록할 수 있게
--     명단 조회를 `group_id is not distinct from p_group` 으로. p_group 이 null 이면 개별 초대만,
--     uuid 면 그 그룹 명단만 찾는다 — 서로의 명단을 건드릴 수 없다. 시그니처는 그대로(호출 호환).
--  2) admin_update_attend_v1 : 등록한 참석자의 측·동반 인원·동반자 이름 수정.
--     연락처는 바꾸지 않는다 (이름+연락처가 RSVP 식별 키라 바꾸면 하객 재제출과 중복될 수 있음).
--     이미 있는 체크인 기록(actual_party_size)은 건드리지 않는다.
--
-- ※ 추가·재정의만 — 앱 배포 전에 먼저 적용한다. 선행: 20261007000200_admin_attend_member.sql

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
  v_count int := least(19, greatest(0, coalesce(p_companions, 0)));
begin
  if p_side is null or p_side not in ('groom', 'bride') then
    raise exception 'invalid_side';
  end if;

  select * into m from public.group_members
   where id = p_member and group_id is not distinct from p_group for update;
  if not found then raise exception 'member_not_found'; end if;
  if m.rsvp_id is not null then raise exception 'already_registered'; end if;

  if p_phone is not null then
    select * into r from public.rsvp where name = btrim(m.name) and phone = p_phone for update;
    if found then
      update public.group_members set rsvp_id = r.id where id = m.id;
      return query select 'linked'::text, r.id;
      return;
    end if;
  end if;

  insert into public.rsvp (
    name, phone, side, attending, companion_count, companion_names,
    children, kids_meal, eating,
    checkin_token, checkin_token_active, qr_issued_at
  ) values (
    btrim(m.name), p_phone, p_side, true, v_count, coalesce(p_names, '{}'),
    0, false, 'yes',
    gen_random_uuid(), true, now()
  ) returning id into v_id;

  update public.group_members set rsvp_id = v_id where id = m.id;
  return query select 'created'::text, v_id;
end;
$$;

create or replace function public.admin_update_attend_v1(
  p_group uuid,
  p_member uuid,
  p_side text,
  p_companions int,
  p_names text[]
)
returns table (rsvp_id uuid)
language plpgsql security invoker set search_path = ''
as $$
declare
  m public.group_members;
  r public.rsvp;
  v_count int := least(19, greatest(0, coalesce(p_companions, 0)));
begin
  if p_side is null or p_side not in ('groom', 'bride') then
    raise exception 'invalid_side';
  end if;

  select * into m from public.group_members
   where id = p_member and group_id is not distinct from p_group for update;
  if not found then raise exception 'member_not_found'; end if;
  if m.rsvp_id is null then raise exception 'not_registered'; end if;

  select * into r from public.rsvp where id = m.rsvp_id for update;
  if not found then raise exception 'not_registered'; end if;
  -- 불참으로 응답한 RSVP 는 여기서 참석으로 바꾸지 않는다 (하객 응답을 조용히 덮어쓰지 않음)
  if not r.attending then raise exception 'not_attending'; end if;

  update public.rsvp set
    side = p_side,
    companion_count = v_count,
    companion_names = coalesce(p_names, '{}'),
    -- 아동 수는 동반 인원을 넘을 수 없다 (하객이 낸 값이 있으면 보존하되 상한만 맞춘다)
    children = least(r.children, v_count),
    updated_at = now()
  where id = r.id;

  return query select r.id;
end;
$$;

revoke all on function public.admin_attend_member_v1(uuid, uuid, text, text, int, text[])
  from public, anon, authenticated;
grant execute on function public.admin_attend_member_v1(uuid, uuid, text, text, int, text[])
  to service_role;

revoke all on function public.admin_update_attend_v1(uuid, uuid, text, int, text[])
  from public, anon, authenticated;
grant execute on function public.admin_update_attend_v1(uuid, uuid, text, int, text[])
  to service_role;

commit;
