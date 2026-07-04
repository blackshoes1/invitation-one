-- Supabase SQL Editor 에서 실행. (v14_group_offer.sql 이후)
-- ★ 배송기사 선택 ★
--   새 주문 스텝에 "배송기사 선택" 추가 — 신랑 단독 🤵 / 신랑+신부 동행 💑
--   합류·제안 승낙은 주문의 rider 를 따르므로 기사 선택 없음.

/* 1) deliveries 에 rider 컬럼 */
alter table public.deliveries
  add column if not exists rider text not null default '신랑'
    check (rider in ('신랑', '신랑+신부'));

/* 2) create_delivery_v2 — p_rider 파라미터 추가
      (기존 8-인자 시그니처는 drop — default 인자 오버로드 모호성 방지) */
drop function if exists public.create_delivery_v2(uuid, text, text, text, date, text, text, uuid);
create or replace function public.create_delivery_v2(
  p_group_id uuid, p_name text, p_phone text, p_location text,
  p_date date, p_time text, p_message text, p_convert uuid default null,
  p_rider text default '신랑'
) returns table (delivery_id uuid, participant_id uuid)
  language plpgsql security definer set search_path = public
as $$
declare d_id uuid; pt_id uuid; v_rider text;
begin
  if p_date < date '2026-07-06' or p_date > date '2026-10-16' then
    raise exception 'out_of_range';
  end if;
  if exists (select 1 from public.blocked_dates b where b.date = p_date) then
    raise exception 'date_taken' using errcode = '23505';
  end if;

  v_rider := case when p_rider in ('신랑', '신랑+신부') then p_rider else '신랑' end;

  insert into public.deliveries (group_id, location, date, time_slot, message, rider)
  values (p_group_id, p_location, p_date, p_time, p_message, v_rider)
  returning id into d_id;

  if p_convert is not null and exists (
    select 1 from public.participants pp where pp.id = p_convert and pp.type = '마음배송'
  ) then
    update public.participants
       set type = '직접배달', delivery_id = d_id, group_id = p_group_id,
           name = p_name, phone = p_phone, is_owner = true, updated_at = now()
     where id = p_convert
     returning id into pt_id;
  else
    insert into public.participants (delivery_id, group_id, type, name, phone, is_owner)
    values (d_id, p_group_id, '직접배달', p_name, p_phone, true)
    returning id into pt_id;
  end if;

  return query select d_id, pt_id;
end $$;
grant execute on function public.create_delivery_v2(uuid, text, text, text, date, text, text, uuid, text) to anon;

/* 3) propose_reschedule — 일정 변경으로 새 주문 복사 시 rider 유지 */
create or replace function public.propose_reschedule(
  p_participant uuid, p_date date, p_time text, p_location text default null
) returns table (result text, moved_count int, new_delivery uuid)
  language plpgsql security definer set search_path = public
as $$
declare me record; cnt int; new_id uuid;
begin
  select * into me from public.participants where id = p_participant;
  if me is null or me.delivery_id is null then
    return query select 'not_found'::text, 0, null::uuid; return;
  end if;
  if not me.is_owner then
    return query select 'not_owner'::text, 0, null::uuid; return;
  end if;
  if p_date < date '2026-07-06' or p_date > date '2026-10-16' then
    return query select 'range'::text, 0, null::uuid; return;
  end if;
  if exists (select 1 from public.blocked_dates b where b.date = p_date) then
    return query select 'taken'::text, 0, null::uuid; return;
  end if;

  select count(*) into cnt from public.participants where delivery_id = me.delivery_id;

  -- 혼자면 예전처럼 즉시 변경
  if cnt <= 1 then
    update public.deliveries
       set date = p_date, time_slot = p_time,
           location = coalesce(nullif(btrim(coalesce(p_location, '')), ''), location),
           updated_at = now()
     where id = me.delivery_id;
    return query select 'solo'::text, 0, me.delivery_id; return;
  end if;

  -- 여러 명 → 대표만 새 날짜의 새 주문으로 이동, 나머지는 기존 날짜에서 동의 대기
  insert into public.deliveries (group_id, location, date, time_slot, message, status, rider)
  select d.group_id,
         coalesce(nullif(btrim(coalesce(p_location, '')), ''), d.location),
         p_date, p_time, d.message, '대기중', d.rider
  from public.deliveries d where d.id = me.delivery_id
  returning id into new_id;

  -- 대표 이동
  update public.participants
     set delivery_id = new_id, is_owner = true, pending_delivery_id = null, updated_at = now()
   where id = p_participant;

  -- 남은 인원: 동의 대기 표시 (기존 날짜 잔류)
  update public.participants
     set pending_delivery_id = new_id, updated_at = now()
   where delivery_id = me.delivery_id and id <> p_participant;

  -- 대표가 빠진 기존 주문 대표 승계
  perform public._after_leave(me.delivery_id);

  select count(*) into cnt
  from public.participants where delivery_id = me.delivery_id;

  return query select 'proposed'::text, cnt, new_id;
end $$;
grant execute on function public.propose_reschedule(uuid, date, text, text) to service_role;
