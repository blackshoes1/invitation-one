-- =============================================================================
-- 문제 3 검증 — 클레임 소유권(lock_token) · 스테일 회수 · 갇힌 행 집계
-- scripts/db-verify.sh 가 만든 DB 위에서 돈다. 운영 DB 를 향해 실행하지 말 것.
-- =============================================================================

\set ON_ERROR_STOP on

do $t$
declare
  pid1 uuid; pid2 uuid;
  o1   uuid;
  tok1 uuid; tok2 uuid;
  n    int;
  g    uuid;
begin
  insert into public.groups (name, slug) values ('알림테스트', 'tst-outbox') returning id into g;

  -- 트리거가 outbox 를 적재한다
  insert into public.participants (group_id, type, name, message)
    values (g, '마음배송', '가', '축하') returning id into pid1;
  insert into public.participants (group_id, type, name, message)
    values (g, '마음배송', '나', '축하') returning id into pid2;

  select o.id into o1 from public.notification_outbox o where o.participant_id = pid1;
  if o1 is null then raise exception '트리거가 outbox 를 적재하지 않았다'; end if;

  ---------------------------------------------------------------------------
  -- 1) 클레임은 소유권 토큰을 발급한다
  ---------------------------------------------------------------------------
  select lock_token into tok1 from public.claim_notifications(10) where id = o1;
  if tok1 is null then raise exception '클레임이 lock_token 을 발급하지 않았다'; end if;

  ---------------------------------------------------------------------------
  -- 2) 방금 클레임한 행은 다시 꺼내지지 않는다 (3분 lease)
  ---------------------------------------------------------------------------
  select count(*) into n from public.claim_notifications(10) where id = o1;
  if n <> 0 then raise exception 'lease 안인데 같은 행이 다시 클레임됐다'; end if;

  ---------------------------------------------------------------------------
  -- 3) lease 를 넘긴 행은 회수되고 **새 토큰**을 받는다
  --    → 예전 주인의 뒤늦은 update 는 토큰이 달라 0행에 적용된다
  ---------------------------------------------------------------------------
  update public.notification_outbox
     set locked_at = now() - interval '5 minutes' where id = o1;
  select lock_token into tok2 from public.claim_notifications(10) where id = o1;
  if tok2 is null then raise exception '스테일 행이 회수되지 않았다'; end if;
  if tok2 = tok1 then raise exception '회수했는데 소유권 토큰이 그대로다'; end if;

  -- 예전 주인이 뒤늦게 실패를 기록하려 해도 반영되지 않아야 한다
  update public.notification_outbox
     set status = 'failed', last_error = 'stale worker'
   where id = o1 and lock_token = tok1;
  get diagnostics n = row_count;
  if n <> 0 then raise exception '회수당한 worker 의 기록이 반영됐다'; end if;

  -- 새 주인은 기록할 수 있다
  update public.notification_outbox
     set status = 'sent', sent_at = now()
   where id = o1 and lock_token = tok2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception '새 주인이 기록하지 못했다'; end if;

  ---------------------------------------------------------------------------
  -- 4) 재시도 한도를 넘긴 행은 다시 꺼내지지 않고 stuck 으로 잡힌다
  ---------------------------------------------------------------------------
  update public.notification_outbox
     set status = 'failed', attempts = 8, next_attempt_at = now() - interval '1 hour'
   where participant_id = pid2;

  select count(*) into n from public.claim_notifications(10)
   where participant_id = pid2;
  if n <> 0 then raise exception '한도를 넘긴 행이 클레임됐다'; end if;

  if public.outbox_stuck_count() < 1 then
    raise exception '한도를 넘긴 미발송 행이 stuck 집계에 안 잡힌다';
  end if;

  ---------------------------------------------------------------------------
  -- 5) 7일 창을 벗어난 미발송 행도 stuck 으로 잡힌다 (자동 발송은 하지 않는다)
  ---------------------------------------------------------------------------
  update public.notification_outbox
     set attempts = 0, status = 'pending', created_at = now() - interval '10 days'
   where participant_id = pid2;
  select count(*) into n from public.claim_notifications(10) where participant_id = pid2;
  if n <> 0 then raise exception '7일 창 밖 행이 클레임됐다 (뒤늦은 발송)'; end if;
  if public.outbox_stuck_count() < 1 then
    raise exception '7일 창 밖 미발송 행이 stuck 집계에 안 잡힌다';
  end if;

  raise notice '문제 3 (클레임 소유권·스테일 회수·stuck 집계) 검증 통과 ✔';
end $t$;
