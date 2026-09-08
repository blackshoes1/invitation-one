-- 문제 4 — '내 신청 찾기'를 관리 토큰 재발급이 아니라 **문자 복구 흐름**으로
--
-- 배경: /api/delivery/find 는 이름 + 연락처 뒤 4자리 + 배송일이 맞으면 그 자리에서
-- 관리 토큰을 **회전 발급해 브라우저로 돌려줬다.** 그 세 가지는 조회 단서지 본인
-- 인증이 아니다 — 청첩장을 받은 사람이면 대개 다 아는 정보고, 뒤 4자리는 1만 분의
-- 1이라 IP 당 10분 20회 제한으로는 며칠이면 뚫린다. 뚫리면 남의 주문을 취소·변경할
-- 수 있다. 게다가 **조회에 성공하기만 하면 기존 관리 링크가 즉시 무효화**돼서,
-- 아무나 남의 링크를 끊어 놓을 수 있었다.
--
-- 새 흐름:
--   ① 찾기 요청 → 일치하면 **DB 에 등록된 번호**로 단기 복구 링크를 문자 발송
--      (브라우저 응답에는 토큰도 전체 번호도 없다. 응답은 일치 여부와 무관하게 동일)
--   ② 복구 링크를 실제로 열었을 때 **비로소** 관리 토큰을 회전해 관리 페이지로
--
-- 이러면 인증되지 않은 요청만으로는 기존 링크가 죽지 않고, 토큰은 번호 소유자에게만
-- 간다. 복구 토큰도 raw 를 저장하지 않고 SHA-256 해시만 남긴다.
--
-- 추가 전용(additive)·멱등. 앱 배포와 순서 무관 — 구 앱은 이 테이블을 안 쓴다.
-- **마이그레이션 먼저, 앱 배포 나중**이 안전하다 (새 앱은 이 테이블이 있어야 동작).
-- 파괴적 변경 없음.

create table if not exists public.manage_recovery_tokens (
  token_hash     text primary key,          -- SHA-256 hex. raw 는 저장하지 않는다
  participant_id uuid not null references public.participants(id) on delete cascade,
  expires_at     timestamptz not null,
  used_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists manage_recovery_tokens_participant_idx
  on public.manage_recovery_tokens (participant_id, created_at desc);

alter table public.manage_recovery_tokens enable row level security;
revoke all on public.manage_recovery_tokens from anon, authenticated;
grant all on public.manage_recovery_tokens to service_role;

comment on table public.manage_recovery_tokens is
  '관리 링크 복구용 단기 토큰 (SHA-256 해시만 저장). 1회용 · 만료 있음. 교환 시 관리 토큰을 회전한다.';

-- ---------------------------------------------------------------------------
-- 복구 토큰 교환 — **원자적 1회용**.
--
-- 조회 후 update 로 나누면 두 요청이 동시에 들어왔을 때 둘 다 통과한다.
-- 한 문장으로 처리해 "쓰이지 않았고 만료되지 않은" 행만 소비한다.
-- 실패(없음·만료·이미 사용)는 전부 빈 결과로 — 어느 쪽인지 알려주지 않는다.
-- ---------------------------------------------------------------------------
create or replace function public.consume_recovery_token(p_hash text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_pid uuid;
begin
  update public.manage_recovery_tokens
     set used_at = now()
   where token_hash = p_hash
     and used_at is null
     and expires_at > now()
  returning participant_id into v_pid;
  return v_pid;   -- 없으면 null
end;
$fn$;

revoke all on function public.consume_recovery_token(text) from public, anon, authenticated;
grant execute on function public.consume_recovery_token(text) to service_role;

-- ---------------------------------------------------------------------------
-- 만료·사용된 토큰 정리 (누적 방지). 드레인처럼 아무 때나 불러도 안전하다.
-- ---------------------------------------------------------------------------
create or replace function public.purge_recovery_tokens()
returns integer
language sql
security definer
set search_path to 'public'
as $fn$
  with gone as (
    delete from public.manage_recovery_tokens
     where expires_at < now() - interval '1 day'
        or used_at    < now() - interval '1 day'
    returning 1
  )
  select count(*)::int from gone;
$fn$;

revoke all on function public.purge_recovery_tokens() from public, anon, authenticated;
grant execute on function public.purge_recovery_tokens() to service_role;
