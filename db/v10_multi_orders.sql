-- Supabase SQL Editor 에서 실행. (v9_guest_count.sql 이후)
-- 1) 날짜당 1주문 제한 해제 — 같은 날 여러 팀 신청 허용.
--    마감은 관리자가 blocked_dates 로 수동 처리 (주문 있는 날짜도 마감 가능).
-- 2) 내 신청 찾기 — 이름+연락처로 participant 조회 (manage 페이지 재접근용).

/* ---------- 1) 슬롯 제한 해제 ---------- */
drop index if exists public.deliveries_date_active_uniq;

-- 달력 비활성화 기준 = 관리자가 마감한 날짜만
create or replace function public.get_booked_dates()
  returns setof date language sql security definer set search_path = public
as $$
  select date from public.blocked_dates;
$$;

-- 새 주문: 같은 날짜 중복 허용, 마감일만 차단
create or replace function public.create_delivery_v2(
  p_group_id uuid, p_name text, p_phone text, p_location text,
  p_date date, p_time text, p_message text, p_convert uuid default null
) returns table (delivery_id uuid, participant_id uuid)
  language plpgsql security definer set search_path = public
as $$
declare d_id uuid; pt_id uuid;
begin
  if p_date < date '2026-07-06' or p_date > date '2026-10-16' then
    raise exception 'out_of_range';
  end if;
  if exists (select 1 from public.blocked_dates b where b.date = p_date) then
    raise exception 'date_taken' using errcode = '23505';
  end if;

  insert into public.deliveries (group_id, location, date, time_slot, message)
  values (p_group_id, p_location, p_date, p_time, p_message)
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

-- 일정 변경: 마감일만 차단
create or replace function public.reschedule_delivery_v2(
  p_participant uuid, p_date date, p_time text, p_location text default null
) returns text language plpgsql security definer set search_path = public
as $$
declare me record;
begin
  select * into me from public.participants where id = p_participant;
  if me is null or me.delivery_id is null then return 'not_found'; end if;
  if not me.is_owner then return 'not_owner'; end if;
  if p_date < date '2026-07-06' or p_date > date '2026-10-16' then return 'range'; end if;
  if exists (select 1 from public.blocked_dates b where b.date = p_date) then
    return 'taken';
  end if;

  update public.deliveries
     set date = p_date, time_slot = p_time,
         location = coalesce(nullif(btrim(coalesce(p_location, '')), ''), location),
         updated_at = now()
   where id = me.delivery_id;
  return 'ok';
end $$;

/* ---------- 2) 내 신청 찾기 ---------- */
create or replace function public.find_participants(p_name text, p_phone text)
  returns table (
    participant_id uuid, type text, name text,
    date date, time_slot text, status text, tracking_stage text
  )
  language sql security definer set search_path = public
as $$
  select p.id as participant_id, p.type, p.name,
         d.date, d.time_slot, d.status, d.tracking_stage
  from public.participants p
  left join public.deliveries d on d.id = p.delivery_id
  where btrim(p.name) = btrim(p_name)
    and p.phone is not null
    and regexp_replace(p.phone, '\D', '', 'g')
        = regexp_replace(p_phone, '\D', '', 'g')
    and (d.id is null or d.status <> '취소')
  order by p.created_at desc;
$$;
grant execute on function public.find_participants(text, text) to anon;
