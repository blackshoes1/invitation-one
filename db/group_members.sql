-- Supabase SQL Editor 에서 실행. (db/groups.sql 이후)
-- 그룹별 멤버 명단(로스터) — 미신청 표시용

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.group_members enable row level security;
-- anon 직접 접근 없음. 관리는 service_role, 공개는 아래 RPC 로만.

-- 그룹 명단 + 신청 상태 (이름·신청여부·날짜·시간대만 공개)
create or replace function public.get_group_status(p_slug text)
  returns table (name text, applied boolean, date date, time_slot text)
  language sql
  security definer
  set search_path = public
as $$
  select gm.name,
         (d.id is not null) as applied,
         d.date,
         d.time_slot
  from public.group_members gm
  join public.groups g on g.id = gm.group_id
  left join public.deliveries d
    on d.group_id = gm.group_id and d.name = gm.name
  where g.slug = p_slug
  order by gm.created_at;
$$;
grant execute on function public.get_group_status(text) to anon;
