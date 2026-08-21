-- P1-1 관리자 세션 저장소
-- 로그인 성공 시 서버가 crypto.randomBytes(32) 로 만든 무작위 토큰을 쿠키로 내려주고,
-- DB 에는 sha256 해시만 저장한다 (ADMIN_PASSWORD 로부터 결정적으로 파생되는 값 없음).
-- 만료(expires_at)·로그아웃(revoked_at) 을 서버에서 강제할 수 있다.
-- 추가 전용(additive) — 기존 테이블/데이터 변경 없음.

create table if not exists public.admin_sessions (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  ip          text,
  user_agent  text
);

create index if not exists admin_sessions_expires_idx on public.admin_sessions (expires_at);

alter table public.admin_sessions enable row level security;
-- 정책 없음 = anon/authenticated 접근 불가. 서버(service_role)만 사용.
revoke all on public.admin_sessions from anon, authenticated;
grant all on public.admin_sessions to service_role;
