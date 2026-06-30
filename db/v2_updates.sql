-- Supabase SQL Editor 에서 실행. (기존 테이블이 만들어진 뒤 v2 업데이트)
-- 예상 인원 / 취소 상태 / 조건부 unique / 취소·변경 RPC

-- 1) 컬럼 추가
alter table public.deliveries
  add column if not exists party_size int,
  add column if not exists updated_at timestamptz not null default now();

-- 2) 상태에 '취소' 허용
alter table public.deliveries drop constraint if exists deliveries_status_check;
alter table public.deliveries
  add constraint deliveries_status_check
  check (status in ('대기중', '확정', '완료', '취소'));

-- 3) 날짜 unique → '취소' 제외 조건부 unique (취소된 날짜는 재신청 가능)
alter table public.deliveries drop constraint if exists deliveries_date_key;
drop index if exists deliveries_date_active_uniq;
create unique index deliveries_date_active_uniq
  on public.deliveries (date)
  where status <> '취소';

-- 4) 예약일/현황 RPC — 취소 건 제외하도록 갱신
create or replace function public.get_booked_dates()
  returns setof date language sql security definer set search_path = public
as $$
  select date from public.deliveries where status <> '취소';
$$;

create or replace function public.get_group_members(p_slug text)
  returns table (name text, date date, time_slot text)
  language sql security definer set search_path = public
as $$
  select d.name, d.date, d.time_slot
  from public.deliveries d
  join public.groups g on g.id = d.group_id
  where g.slug = p_slug and d.status <> '취소'
  order by d.date;
$$;

create or replace function public.get_group_status(p_slug text)
  returns table (name text, applied boolean, date date, time_slot text)
  language sql security definer set search_path = public
as $$
  select gm.name,
         (d.id is not null) as applied,
         d.date, d.time_slot
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  left join public.deliveries d
    on d.group_id = gm.group_id and d.name = gm.name and d.status <> '취소'
  where g.slug = p_slug
  order by gm.created_at;
$$;

-- 5) 취소/변경 페이지용 RPC (deliveryId 가 곧 접근 토큰)
create or replace function public.get_delivery(p_id uuid)
  returns table (
    id uuid, group_id uuid, name text, location text,
    date date, time_slot text, party_size int, status text
  )
  language sql security definer set search_path = public
as $$
  select id, group_id, name, location, date, time_slot, party_size, status
  from public.deliveries where id = p_id;
$$;
grant execute on function public.get_delivery(uuid) to anon;

-- 날짜/시간 변경: 새 날짜가 비어 있으면 갱신, 차 있으면 'taken'
create or replace function public.reschedule_delivery(
  p_id uuid, p_date date, p_time text
) returns text
  language plpgsql security definer set search_path = public
as $$
declare cnt int;
begin
  if p_date < date '2026-07-06' or p_date > date '2026-10-16' then
    return 'range';
  end if;
  select count(*) into cnt from public.deliveries
    where date = p_date and status <> '취소' and id <> p_id;
  if cnt > 0 then return 'taken'; end if;
  update public.deliveries
    set date = p_date, time_slot = p_time, updated_at = now()
    where id = p_id and status <> '취소';
  return 'ok';
end;
$$;
grant execute on function public.reschedule_delivery(uuid, date, text) to anon;

-- 신청 취소: 슬롯 즉시 해제
create or replace function public.cancel_delivery(p_id uuid)
  returns void language sql security definer set search_path = public
as $$
  update public.deliveries set status = '취소', updated_at = now() where id = p_id;
$$;
grant execute on function public.cancel_delivery(uuid) to anon;
