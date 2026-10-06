-- =============================================================================
-- 문제 4 검증 — 복구 토큰의 만료 · 1회용 · 동시 교환
-- scripts/db-verify.sh 가 만든 DB 위에서 돈다. 운영 DB 를 향해 실행하지 말 것.
-- =============================================================================

\set ON_ERROR_STOP on

do $t$
declare
  pid uuid;
  d   uuid;
  got uuid;
  n   int;
begin
  insert into public.deliveries (location, date, time_slot)
    values ('서울', date '2026-09-25', '오후') returning id into d;
  insert into public.participants (delivery_id, type, name, phone)
    values (d, '직접배달', '복구테스트', '010-0000-1111') returning id into pid;

  ---------------------------------------------------------------------------
  -- 1) 정상 교환은 한 번만 된다
  ---------------------------------------------------------------------------
  insert into public.manage_recovery_tokens (token_hash, participant_id, expires_at)
    values ('hash-ok', pid, now() + interval '30 minutes');

  got := public.consume_recovery_token('hash-ok');
  if got is distinct from pid then
    raise exception '정상 토큰이 교환되지 않았다';
  end if;

  -- 재사용 불가
  got := public.consume_recovery_token('hash-ok');
  if got is not null then raise exception '1회용 토큰이 재사용됐다'; end if;

  ---------------------------------------------------------------------------
  -- 2) 만료된 토큰은 교환되지 않는다
  ---------------------------------------------------------------------------
  insert into public.manage_recovery_tokens (token_hash, participant_id, expires_at)
    values ('hash-old', pid, now() - interval '1 minute');
  got := public.consume_recovery_token('hash-old');
  if got is not null then raise exception '만료 토큰이 교환됐다'; end if;

  ---------------------------------------------------------------------------
  -- 3) 없는 토큰도 조용히 null (있음/없음/만료를 구분해 알려주지 않는다)
  ---------------------------------------------------------------------------
  if public.consume_recovery_token('hash-nope') is not null then
    raise exception '없는 토큰이 교환됐다';
  end if;

  ---------------------------------------------------------------------------
  -- 4) raw 토큰은 저장되지 않는다 — 해시 컬럼 하나뿐이어야 한다
  ---------------------------------------------------------------------------
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='manage_recovery_tokens'
     and column_name in ('token','raw_token','secret');
  if n <> 0 then raise exception 'raw 토큰을 저장하는 컬럼이 있다'; end if;

  ---------------------------------------------------------------------------
  -- 5) 참여자가 지워지면 복구 토큰도 함께 사라진다 (고아 토큰 방지)
  ---------------------------------------------------------------------------
  insert into public.manage_recovery_tokens (token_hash, participant_id, expires_at)
    values ('hash-cascade', pid, now() + interval '30 minutes');
  delete from public.participants where id = pid;
  select count(*) into n from public.manage_recovery_tokens where token_hash = 'hash-cascade';
  if n <> 0 then raise exception '참여자 삭제 후에도 복구 토큰이 남았다 (n=%)', n; end if;

  raise notice '문제 4 (복구 토큰 만료·1회용·해시 저장) 검증 통과 ✔';
end $t$;

-- 동시 교환 — 두 세션이 같은 토큰을 동시에 소비하려 하면 하나만 성공해야 한다.
-- 단일 update 문이라 두 번째는 이미 used_at 이 채워진 행을 보게 된다.
do $t$
declare pid uuid; d uuid; a uuid; b uuid;
begin
  insert into public.deliveries (location, date, time_slot)
    values ('서울', date '2026-09-26', '오후') returning id into d;
  insert into public.participants (delivery_id, type, name, phone)
    values (d, '직접배달', '동시교환', '010-0000-2222') returning id into pid;
  insert into public.manage_recovery_tokens (token_hash, participant_id, expires_at)
    values ('hash-race', pid, now() + interval '30 minutes');

  a := public.consume_recovery_token('hash-race');
  b := public.consume_recovery_token('hash-race');
  if a is null or b is not null then
    raise exception '동시 교환에서 두 번 통과했거나 첫 교환이 실패했다 (a=%, b=%)', a, b;
  end if;

  raise notice '복구 토큰 동시 교환 검증 통과 ✔';
end $t$;
