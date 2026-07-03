-- Supabase SQL Editor 에서 실행. (v11_find_by_date.sql 이후)
-- 합석 제안: 신청 중 같은 날짜에 기존 주문이 있으면
-- "먼저 신청하신 분이 있어요 (성*영). 합석하시겠어요?" 를 띄우기 위한 조회.
-- 이름은 서버에서 가운데 마스킹해서 내려줌 (프라이버시).

create or replace function public.get_orders_on_date(p_date date)
  returns table (id uuid, time_slot text, member_count int, owner_masked text)
  language sql security definer set search_path = public
as $$
  select d.id, d.time_slot,
         (select count(*)::int from public.participants x where x.delivery_id = d.id) as member_count,
         (select case
                   when length(btrim(p.name)) <= 1 then btrim(p.name)
                   when length(btrim(p.name)) = 2
                     then substr(btrim(p.name), 1, 1) || '*'
                   else substr(btrim(p.name), 1, 1)
                        || repeat('*', length(btrim(p.name)) - 2)
                        || substr(btrim(p.name), length(btrim(p.name)), 1)
                 end
          from public.participants p
          where p.delivery_id = d.id
          order by p.is_owner desc, p.created_at asc
          limit 1) as owner_masked
  from public.deliveries d
  where d.date = p_date and d.status in ('대기중', '확정')
  order by d.created_at asc;
$$;
grant execute on function public.get_orders_on_date(date) to anon;
