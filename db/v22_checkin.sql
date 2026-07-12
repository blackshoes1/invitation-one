-- Supabase SQL Editor 에서 실행. (v21_reply.sql 이후)
-- ★ GX-4 현장 체크인 QR (실시간 식수 집계) ★
--   예식 당일 하객이 QR(/checkin)을 스캔해 참석 인원을 체크인 → 실시간 식수 합계.
--   공개 조회/쓰기는 security definer RPC 로만(anon 직접 테이블 접근 없음).

/* 1) 체크인 테이블 */
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  name text,                              -- 하객 이름 (선택)
  party_size int not null default 1 check (party_size between 1 and 20),
  side text check (side is null or side in ('신랑', '신부')),
  created_at timestamptz not null default now()
);
alter table public.checkins enable row level security;
create index if not exists checkins_created_idx on public.checkins (created_at desc);

/* 2) 실시간 요약 (공개 조회) — 체크인 건수 + 총 인원(식수) + 신랑/신부측 */
create or replace function public.get_checkin_summary()
  returns table (total_checkins int, total_people int, groom int, bride int)
  language sql security definer set search_path = public
as $$
  select count(*)::int,
         coalesce(sum(party_size), 0)::int,
         coalesce(sum(party_size) filter (where side = '신랑'), 0)::int,
         coalesce(sum(party_size) filter (where side = '신부'), 0)::int
  from public.checkins;
$$;
grant execute on function public.get_checkin_summary() to anon;

/* 3) 체크인 등록 — 인원/측 기록 후 갱신된 합계 반환 */
create or replace function public.submit_checkin(
  p_name text, p_party int, p_side text
) returns table (total_checkins int, total_people int)
  language plpgsql security definer set search_path = public
as $$
begin
  if p_party is null or p_party < 1 or p_party > 20 then p_party := 1; end if;
  insert into public.checkins (name, party_size, side)
  values (
    nullif(btrim(coalesce(p_name, '')), ''),
    p_party,
    case when p_side in ('신랑', '신부') then p_side else null end
  );
  return query
    select count(*)::int, coalesce(sum(party_size), 0)::int
    from public.checkins;
end $$;
grant execute on function public.submit_checkin(text, int, text) to anon;
