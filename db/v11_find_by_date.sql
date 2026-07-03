-- Supabase SQL Editor 에서 실행. (v10_multi_orders.sql 이후)
-- 내 신청 찾기 조건 변경: 이름 + 연락처 끝 4자리 + 신청(배송)일자

drop function if exists public.find_participants(text, text);

create or replace function public.find_participants(
  p_name text, p_last4 text, p_date date
) returns table (
    participant_id uuid, type text, name text,
    date date, time_slot text, status text, tracking_stage text
  )
  language sql security definer set search_path = public
as $$
  select p.id as participant_id, p.type, p.name,
         d.date, d.time_slot, d.status, d.tracking_stage
  from public.participants p
  join public.deliveries d on d.id = p.delivery_id
  where p.type = '직접배달'
    and d.status <> '취소'
    and d.date = p_date
    and btrim(p.name) = btrim(p_name)
    and p.phone is not null
    and right(regexp_replace(p.phone, '\D', '', 'g'), 4) = p_last4
  order by p.created_at desc;
$$;
grant execute on function public.find_participants(text, text, date) to anon;
