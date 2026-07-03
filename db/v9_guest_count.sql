-- Supabase SQL Editor 에서 실행. (v8_blocked_dates.sql 이후)
-- 남은 자리를 "인원 수" 기준으로 표기하기 위한 공개 카운트 RPC.
-- 직접배달 참여자(취소 주문 제외) 수만 센다 (= 나갈 종이 청첩장 수량).

create or replace function public.get_delivery_guest_count()
  returns int language sql security definer set search_path = public
as $$
  select count(*)::int
  from public.participants p
  join public.deliveries d on d.id = p.delivery_id
  where p.type = '직접배달' and d.status <> '취소';
$$;
grant execute on function public.get_delivery_guest_count() to anon;
