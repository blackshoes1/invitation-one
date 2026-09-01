-- 카카오 관리자 알림이 오지 않던 회귀 수정
--
-- 배경: 알림 적재 트리거가 "service_role 로 들어온 insert 는 관리자 조작"이라고
--       보고 outbox 적재를 건너뛰었다. 당시엔 하객 신청이 anon RPC 로 들어와서
--       그 가정이 맞았지만, P1-1(20260828000200)에서 공개 write RPC 를 전부
--       Next API(service_role) 뒤로 옮기면서 모든 하객 신청이 service_role 로
--       실행되게 됐고 → 그날 이후 알림이 한 건도 적재되지 않았다.
--
-- 수정: 역할로 판단하지 않고 항상 적재한다. "관리자가 직접 만든 주문"은 서버
--       API 가 생성 직후 해당 outbox 행을 skipped 로 표시해 발송을 막는다
--       (역할 추론보다 명시적이고, 경로가 늘어나도 깨지지 않는다).
-- 추가 전용·멱등. 앱 배포와 순서 무관 (구 앱에서도 정상 동작).

create or replace function public._enqueue_participant_notification()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into public.notification_outbox (kind, dedupe_key, participant_id)
  values ('kakao_admin', 'participant:' || new.id::text, new.id)
  on conflict (dedupe_key) do nothing;
  return new;
exception when others then
  -- 알림 적재 실패가 신청 자체를 막지 않도록 (기존 동작 유지)
  return new;
end;
$$;

-- 트리거가 막혀 있던 기간(2026-08-28 이후)에 들어온 신청분 백필.
-- dedupe_key 충돌은 무시되므로 이미 적재된 건은 건드리지 않는다.
insert into public.notification_outbox (kind, dedupe_key, participant_id)
select 'kakao_admin', 'participant:' || p.id::text, p.id
from public.participants p
where p.notified_at is null
  and p.created_at >= timestamptz '2026-08-28 00:00:00+00'
on conflict (dedupe_key) do nothing;
