-- P1-3 카카오 관리자 알림 아웃박스
-- 문제: /api/notify 는 하객 브라우저가 fire-and-forget 으로 호출 + 카카오 API 실패 시 유실,
--       participant_id(추측 가능 UUID) 기반 공개 호출.
-- 해결: participants insert 시 DB 트리거가 outbox 행을 멱등(dedupe_key unique)하게 적재하고,
--       서버가 claim_notifications()(FOR UPDATE SKIP LOCKED 원자 클레임)로 꺼내 발송한다.
--       실패 시 status/attempts/last_error/next_attempt_at(백오프) 기록 → 재시도.
-- 추가 전용(additive). 기존 participants.notified_at(v24) 은 발송 성공 시 함께 채워 호환 유지.

create table if not exists public.notification_outbox (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null default 'kakao_admin',
  dedupe_key      text not null unique,
  participant_id  uuid references public.participants(id) on delete set null,
  status          text not null default 'pending'
                  check (status in ('pending','sending','sent','failed','skipped')),
  attempts        int  not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at       timestamptz,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists notification_outbox_pending_idx
  on public.notification_outbox (status, next_attempt_at);

alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;
grant all on public.notification_outbox to service_role;

-- participants insert → outbox 적재 (하객 경로인 anon RPC 만; 서버(service_role) 직접 insert 는 제외)
create or replace function public._enqueue_participant_notification()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
begin
  if v_role = 'service_role' then
    return new; -- 관리자 수기 등록·병합 등은 알림 대상 아님
  end if;
  insert into public.notification_outbox (kind, dedupe_key, participant_id)
  values ('kakao_admin', 'participant:' || new.id::text, new.id)
  on conflict (dedupe_key) do nothing;
  return new;
exception when others then
  -- 알림 적재 실패가 신청 자체를 막지 않도록
  return new;
end;
$$;

drop trigger if exists participants_enqueue_notification on public.participants;
create trigger participants_enqueue_notification
  after insert on public.participants
  for each row execute function public._enqueue_participant_notification();

-- 원자 클레임: pending/failed(재시도 시각 도래) + 3분 넘게 sending 에 머문(중단) 행
-- 최근 2일 이내 생성분만 (오래된 알림은 뒤늦게 폭주하지 않도록)
create or replace function public.claim_notifications(p_limit int default 5, p_max_attempts int default 8)
returns setof public.notification_outbox
language plpgsql security definer set search_path = public
as $$
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
        and x.created_at > now() - interval '2 days'
      order by x.created_at
      limit greatest(1, least(coalesce(p_limit, 5), 20))
      for update skip locked
   )
  returning o.*;
end;
$$;
revoke all on function public.claim_notifications(int, int) from public, anon, authenticated;
grant execute on function public.claim_notifications(int, int) to service_role;
