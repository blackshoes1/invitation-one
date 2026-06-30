-- Supabase SQL Editor 에서 실행. (v2_updates.sql 이후)
-- 신청 삽입 + 주문 ID 반환 RPC.
-- anon 은 deliveries 를 직접 SELECT 할 수 없으므로(연락처 보호),
-- security definer 함수로 삽입하고 새 id 만 돌려줍니다.

create or replace function public.create_delivery(
  p_group_id uuid,
  p_name text,
  p_phone text,
  p_location text,
  p_date date,
  p_time text,
  p_party int,
  p_message text
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  new_id uuid;
begin
  if p_date < date '2026-07-06' or p_date > date '2026-10-16' then
    raise exception 'out_of_range';
  end if;

  -- 활성(취소 제외) 슬롯이 이미 있으면 차단 (조건부 unique 인덱스도 동시 방어)
  if exists (
    select 1 from public.deliveries
    where date = p_date and status <> '취소'
  ) then
    raise exception 'date_taken' using errcode = '23505';
  end if;

  insert into public.deliveries(
    group_id, name, phone, location, date, time_slot, party_size, message
  ) values (
    p_group_id, p_name, p_phone, p_location, p_date, p_time, p_party, p_message
  ) returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.create_delivery(
  uuid, text, text, text, date, text, int, text
) to anon;
