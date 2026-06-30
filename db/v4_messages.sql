-- Supabase SQL Editor 에서 실행. (이전 db 파일들 이후)
-- 마음 배송 메시지 / 방명록

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete set null,
  name text not null,
  stamp text,
  message text,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

-- 연락처 등 민감정보가 없으므로 anon 읽기/쓰기 허용 (방명록 공개)
drop policy if exists "messages_anon_insert" on public.messages;
create policy "messages_anon_insert"
  on public.messages for insert to anon with check (true);

drop policy if exists "messages_anon_select" on public.messages;
create policy "messages_anon_select"
  on public.messages for select to anon using (true);
