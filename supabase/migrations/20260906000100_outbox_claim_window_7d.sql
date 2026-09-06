-- 알림 아웃박스 클레임 창을 2일 → 7일로 넓힌다.
--
-- 배경: claim_notifications 는 `created_at > now() - interval '2 days'` 인 행만
-- 꺼낸다. 드레인이 이틀 넘게 멈추면 그 사이 쌓인 알림은 재시도 대상에서 영구히
-- 빠져 조용히 사라진다 — 실패로 기록되지도 않아 사라진 줄도 모른다.
--
-- 실제로 2026-09-05 안전망 크론이 401 로 죽어 있는 동안 알림 하나가 9시간 넘게
-- 묶여 있었다. 이번엔 이틀 안이라 살렸지만, 안전망이 통째로 멈추는 일은 이미
-- 한 번 일어났다(Actions 한도 소진). 예식(2026-10-18) 전에 같은 일이 나면
-- 주문 알림을 통째로 놓친다.
--
-- 7일이면 주말을 낀 장애도 넘긴다. 완전히 없애지 않는 이유는 예식이 끝나고
-- 몇 달 뒤에 남은 행이 되살아나 뜬금없는 알림이 가는 걸 막기 위해서다.
-- (재시도 횟수는 attempts < p_max_attempts 가 따로 제한한다)
--
-- 변경은 이 한 줄뿐 — 나머지 로직(3분 스테일 락 회수·원자 클레임·정렬·잠금
-- 건너뛰기)은 그대로다.

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
     set status = 'sending', locked_at = now(), attempts = o.attempts + 1, updated_at = now()
   where o.id in (
     select x.id from public.notification_outbox x
      where (
              (x.status in ('pending','failed') and x.next_attempt_at <= now())
           or (x.status = 'sending' and x.locked_at < now() - interval '3 minutes')
            )
        and x.attempts < p_max_attempts
        and x.created_at > now() - interval '7 days'   -- was: 2 days
      order by x.created_at
      limit greatest(1, least(coalesce(p_limit, 5), 20))
      for update skip locked
   )
  returning o.*;
end;
$function$;
