-- Supabase SQL Editor 에서 실행. (v15_rider.sql 이후)
-- 배송기사 선택지 확장: 신랑 / 신부 / 신랑+신부

/* 1) rider 체크 제약에 '신부' 추가 */
alter table public.deliveries drop constraint if exists deliveries_rider_check;
alter table public.deliveries
  add constraint deliveries_rider_check
  check (rider in ('신랑', '신부', '신랑+신부'));

/* 2) create_delivery_v2 — 허용 rider 값에 '신부' 추가 */
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

  v_rider := case when p_rider in ('신랑', '신부', '신랑+신부') then p_rider else '신랑' end;

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
