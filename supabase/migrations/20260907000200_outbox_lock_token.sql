-- 문제 3 — 알림 클레임에 소유권 토큰을 붙인다 (경합 시 상태 덮어쓰기 방지)
--
-- 배경: claim_notifications 는 3분 넘게 'sending' 에 머문 행을 중단된 것으로 보고
-- 회수한다. 그런데 원래 worker 가 죽은 게 아니라 **느렸을 뿐**이면 (발송 fetch 에
-- timeout 이 없어 무한정 매달릴 수 있었다) 두 worker 가 같은 행을 동시에 들고 있게
-- 되고, 늦게 끝난 쪽이 새 주인의 상태를 덮어쓴다:
--
--   worker A 클레임 → (느림) → worker B 회수·발송·sent
--                            → A 가 뒤늦게 실패 기록 → 행이 failed 로 되돌아감
--                            → 다음 드레인이 또 보낸다 (중복 발송)
--
-- 해결: 클레임할 때 lock_token 을 새로 발급하고, 상태를 기록할 때 그 토큰이 아직
-- 자기 것인지 확인한다. 회수당한 worker 의 update 는 0행에 적용돼 조용히 무시된다.
--
-- 추가 전용(additive)·멱등. 구 앱은 lock_token 을 보지 않으므로 그대로 동작한다
-- (다만 소유권 검사를 못 받는다) → **마이그레이션 먼저, 앱 배포 나중**이 안전하다.
-- 파괴적 변경 없음 — 기존 행은 lock_token 이 null 인 채로 남고 다음 클레임에 채워진다.

alter table public.notification_outbox
  add column if not exists lock_token uuid;

comment on column public.notification_outbox.lock_token is
  '클레임 소유권 토큰. 상태를 기록할 때 이 값이 일치해야 한다 (회수당한 worker 의 뒤늦은 update 차단).';

-- 클레임: 기존 로직(원자 update · 3분 스테일 회수 · 지수 백오프 · 7일 창 ·
-- attempts 한도 · for update skip locked) 그대로, lock_token 발급만 추가한다.
create or replace function public.claim_notifications(
  p_limit integer default 5,
  p_max_attempts integer default 8
)
returns setof notification_outbox
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  update public.notification_outbox o
     set status = 'sending',
         locked_at = now(),
         lock_token = gen_random_uuid(),   -- 이번 클레임의 소유권
         attempts = o.attempts + 1,
         updated_at = now()
   where o.id in (
     select x.id from public.notification_outbox x
      where (
              (x.status in ('pending','failed') and x.next_attempt_at <= now())
           or (x.status = 'sending' and x.locked_at < now() - interval '3 minutes')
            )
        and x.attempts < p_max_attempts
        and x.created_at > now() - interval '7 days'
      order by x.created_at
      limit greatest(1, least(coalesce(p_limit, 5), 20))
      for update skip locked
   )
  returning o.*;
end;
$function$;

revoke all on function public.claim_notifications(int, int) from public, anon, authenticated;
grant execute on function public.claim_notifications(int, int) to service_role;

-- ---------------------------------------------------------------------------
-- 운영자가 "조용히 죽은 알림"을 찾을 수 있게 한다.
--
-- 재시도 한도(attempts >= 8)를 넘겼거나 클레임 창(7일)을 벗어난 미발송 행은
-- claim_notifications 가 영원히 꺼내지 않는다. 지금까지는 그런 행이 생겨도
-- 아무 데도 드러나지 않아 사라진 줄도 몰랐다.
--
-- 여기서 **세기만 한다** — 오래된 알림을 뒤늦게 무단 발송하지 않는다.
-- 예식이 끝난 뒤 몇 달 지나 뜬금없는 알림이 가는 걸 막는 게 7일 창의 목적이다.
-- ---------------------------------------------------------------------------
create or replace function public.outbox_stuck_count(p_max_attempts integer default 8)
returns integer
language sql
security definer
set search_path to 'public'
as $function$
  select count(*)::int
    from public.notification_outbox o
   where o.status in ('pending', 'failed', 'sending')
     and (o.attempts >= p_max_attempts
          or o.created_at <= now() - interval '7 days');
$function$;

revoke all on function public.outbox_stuck_count(int) from public, anon, authenticated;
grant execute on function public.outbox_stuck_count(int) to service_role;
