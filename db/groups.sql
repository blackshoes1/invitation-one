-- Supabase SQL Editor 에서 실행. (db/deliveries.sql 이후에 실행하세요)
-- 그룹 시스템 + 대기자 명단

-- 1) 그룹 테이블
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);
alter table public.groups enable row level security;
-- 그룹은 RPC(security definer)로만 공개. 직접 select 정책은 두지 않음.

-- 2) deliveries 에 group_id 연결
alter table public.deliveries
  add column if not exists group_id uuid references public.groups(id) on delete set null;

-- 3) 대기자 명단
create table if not exists public.waiting_list (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);
alter table public.waiting_list enable row level security;

drop policy if exists "waiting_anon_insert" on public.waiting_list;
create policy "waiting_anon_insert"
  on public.waiting_list for insert
  to anon
  with check (true);

-- 4) 슬러그로 그룹 조회 (id·name·slug 만 공개)
create or replace function public.get_group(p_slug text)
  returns table (id uuid, name text, slug text)
  language sql
  security definer
  set search_path = public
as $$
  select id, name, slug from public.groups where slug = p_slug;
$$;
grant execute on function public.get_group(text) to anon;

-- 5) 그룹 신청 현황 (이름·날짜·시간대만 공개, 연락처는 숨김)
create or replace function public.get_group_members(p_slug text)
  returns table (name text, date date, time_slot text)
  language sql
  security definer
  set search_path = public
as $$
  select d.name, d.date, d.time_slot
  from public.deliveries d
  join public.groups g on g.id = d.group_id
  where g.slug = p_slug
  order by d.date;
$$;
grant execute on function public.get_group_members(text) to anon;
