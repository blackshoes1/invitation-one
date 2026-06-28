-- Supabase SQL Editor 에 붙여넣고 실행하세요.
-- 청첩장 배달 신청 테이블 + 정책 + 예약일 조회 함수

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  location text not null,
  date date not null unique,                 -- 날짜당 1건 제한
  time_slot text check (time_slot in ('오전', '오후', '저녁')),
  message text,
  status text not null default '대기중'
    check (status in ('대기중', '확정', '완료')),
  -- 신청 가능 기간 제한
  constraint deliveries_date_range
    check (date between date '2026-07-06' and date '2026-10-16')
);

alter table public.deliveries enable row level security;

-- 하객(anon)은 '대기중' 상태로 신청(insert)만 가능. 조회/수정 불가.
drop policy if exists "deliveries_anon_insert" on public.deliveries;
create policy "deliveries_anon_insert"
  on public.deliveries for insert
  to anon
  with check (status = '대기중');

-- 예약된 날짜만 노출하는 함수(이름·연락처는 감춤). 달력 비활성화에 사용.
create or replace function public.get_booked_dates()
  returns setof date
  language sql
  security definer
  set search_path = public
as $$
  select date from public.deliveries;
$$;

grant execute on function public.get_booked_dates() to anon;

-- 관리자는 service_role 키(서버)로만 전체 조회/상태 변경합니다.
