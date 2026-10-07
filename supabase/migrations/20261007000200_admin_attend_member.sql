-- 관리자: 그룹 명단 사람을 참석자(RSVP)로 수동 등록
--  - rsvp.companion_names : 동반자 이름 (빈 문자열 = 이름 미입력 칸). 인원은 companion_count 가 기준.
--  - admin_attend_member_v1 : 명단 행을 잠그고 → RSVP 생성(또는 기존 RSVP 연결) → 명단에 rsvp_id 기록.
--    한 트랜잭션이라 더블클릭·동시 요청에도 같은 사람이 두 번 등록되지 않는다.
--    같은 이름·연락처의 RSVP 가 이미 있으면 하객이 직접 낸 응답을 덮어쓰지 않고 연결만 한다.
--
-- ※ 추가 전용 — 앱 배포 전에 먼저 적용한다 (현장운영 목록이 companion_names 를 읽는다).
--   선행: 20261007000100_group_member_attendee.sql (group_members.rsvp_id)

begin;

alter table public.rsvp
  add column if not exists companion_names text[] not null default '{}';

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

  -- 같은 사람에 대한 동시 등록을 직렬화한다
  select * into m from public.group_members where id = p_member and group_id = p_group for update;
  if not found then raise exception 'member_not_found'; end if;
  if m.rsvp_id is not null then raise exception 'already_registered'; end if;

  -- 하객이 이미 직접 제출한 RSVP 는 덮어쓰지 않고 연결만 한다
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

revoke all on function public.admin_attend_member_v1(uuid, uuid, text, text, int, text[])
  from public, anon, authenticated;
grant execute on function public.admin_attend_member_v1(uuid, uuid, text, text, int, text[])
  to service_role;

commit;
