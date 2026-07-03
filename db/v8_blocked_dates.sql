-- Supabase SQL Editor 에서 실행. (v7_participants.sql 이후)
-- 관리자 날짜 차단(일정 가능 on/off): blocked_dates 에 있는 날짜는 신청 불가.

create table if not exists public.blocked_dates (
  date date primary key,
  created_at timestamptz not null default now()
);
alter table public.blocked_dates enable row level security;
-- anon 직접 접근 없음. 관리는 service_role, 공개는 get_booked_dates 로만.

-- 예약일 조회: 활성 주문 + 차단일을 합쳐 반환 (달력 비활성화용)
create or replace function public.get_booked_dates()
  returns setof date language sql security definer set search_path = public
as $$
  select date from public.deliveries where status <> '취소'
  union
  select date from public.blocked_dates;
$$;

-- 새 주문: 차단일 검사 추가
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
  if exists (select 1 from public.deliveries dd where dd.date = p_date and dd.status <> '취소') then
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

-- 일정 변경: 차단일 검사 추가
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
  if exists (
    select 1 from public.deliveries dd
    where dd.date = p_date and dd.status <> '취소' and dd.id <> me.delivery_id
  ) then return 'taken'; end if;

  update public.deliveries
     set date = p_date, time_slot = p_time,
         location = coalesce(nullif(btrim(coalesce(p_location, '')), ''), location),
         updated_at = now()
   where id = me.delivery_id;
  return 'ok';
end $$;
