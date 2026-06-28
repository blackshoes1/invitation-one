-- Supabase SQL Editor 에 붙여넣고 실행하세요.
-- RSVP(참석 회신) 응답 저장 테이블 + 익명 insert 허용 정책

create table if not exists public.rsvp (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  side text check (side in ('groom', 'bride')),
  attending boolean not null default true,
  companion_count int not null default 0,
  eating text check (eating in ('yes', 'no', 'undecided')),
  memo text
);

alter table public.rsvp enable row level security;

-- 하객(anon)은 입력만 가능, 조회는 불가(개인정보 보호)
drop policy if exists "rsvp_anon_insert" on public.rsvp;
create policy "rsvp_anon_insert"
  on public.rsvp for insert
  to anon
  with check (true);

-- 응답 확인은 Supabase 대시보드(Table Editor)에서 보거나,
-- service_role 키로 조회하세요.
