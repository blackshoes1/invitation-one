-- =============================================================================
-- 문제 1·2 검증 — admin_create_order_v1 의 원자성 · 멱등성 · 재신청 판정
--
-- scripts/db-verify.sh 가 만든 DB(레거시 + 전체 마이그레이션) 위에서 돈다.
-- 각 케이스는 자기 데이터를 만들고 단언한다. 위반이 있으면 exception 으로 중단.
-- 운영 DB 를 향해 실행하지 말 것 — 데이터를 만든다.
-- =============================================================================

\set ON_ERROR_STOP on

do $t$
declare
  g            uuid;
  m_ok         uuid;   -- 취소 이력만 있는 사람
  m_heart      uuid;   -- 마음배송만 한 사람
  m_active     uuid;   -- 다른 유효 주문에 이미 신청한 사람
  m_dupe_a     uuid;   -- 동명이인 A
  m_dupe_b     uuid;   -- 동명이인 B
  m_legacy     uuid;   -- 명단 연결 없는 과거 신청이 있는 사람
  d_cancel     uuid;
  d_active     uuid;
  d_legacy     uuid;
  res          jsonb;
  res2         jsonb;
  n            int;
  reasons      jsonb;
begin
  ---------------------------------------------------------------------------
  -- fixture
  ---------------------------------------------------------------------------
  insert into public.groups (name, slug) values ('테스트그룹', 'tst-atomic')
    returning id into g;

  insert into public.group_members (group_id, name, phone) values
    (g, '취소이력', '010-1111-0001') returning id into m_ok;
  insert into public.group_members (group_id, name, phone) values
    (g, '마음만', '010-1111-0002') returning id into m_heart;
  insert into public.group_members (group_id, name, phone) values
    (g, '이미신청', '010-1111-0003') returning id into m_active;
  insert into public.group_members (group_id, name) values
    (g, '동명이인') returning id into m_dupe_a;
  insert into public.group_members (group_id, name) values
    (g, '동명이인') returning id into m_dupe_b;
  insert into public.group_members (group_id, name, phone) values
    (g, '과거신청', '010-1111-0006') returning id into m_legacy;

  -- 취소된 직접배달 (연결 있음) — 새 신청을 막아선 안 된다
  insert into public.deliveries (group_id, location, date, time_slot, status)
    values (g, '서울', date '2026-08-01', '오후', '취소') returning id into d_cancel;
  insert into public.participants (delivery_id, group_id, type, name, group_member_id)
    values (d_cancel, g, '직접배달', '취소이력', m_ok);

  -- 마음배송만 (연결 있음) — 역시 막아선 안 된다
  insert into public.participants (group_id, type, name, message, group_member_id)
    values (g, '마음배송', '마음만', '축하해요', m_heart);

  -- 다른 유효 주문에 이미 신청 (연결 있음) — 조용히 옮기지 말고 제외 사유를 남긴다
  insert into public.deliveries (group_id, location, date, time_slot)
    values (g, '서울', date '2026-08-02', '오후') returning id into d_active;
  insert into public.participants (delivery_id, group_id, type, name, group_member_id)
    values (d_active, g, '직접배달', '이미신청', m_active);

  -- 명단 연결이 없는 과거 신청 (이름 유일) — 유일하게 특정되므로 연결만 한다
  insert into public.deliveries (group_id, location, date, time_slot)
    values (g, '서울', date '2026-08-03', '오후') returning id into d_legacy;
  insert into public.participants (delivery_id, group_id, type, name)
    values (d_legacy, g, '직접배달', '과거신청');

  ---------------------------------------------------------------------------
  -- 1) 명단 일괄 등록 — 취소·마음배송 이력이 새 신청을 막지 않는다
  ---------------------------------------------------------------------------
  res := public.admin_create_order_v1(
    'req-key-0001', g, null, null, '서울 강남', date '2026-09-20', '오후',
    null, '신랑', true);

  reasons := res #> '{roster,skipped}';

  -- 취소 이력만 있는 사람 · 마음배송만 한 사람 · 동명이인 둘 = 4명 등록
  if (res #>> '{roster,added}')::int <> 4 then
    raise exception '취소/마음배송/동명이인이 등록되지 않았다: added=%  skipped=%',
      res #>> '{roster,added}', reasons;
  end if;

  -- 이미 유효 주문이 있는 사람은 조용히 옮기지 않고 사유를 남긴다
  if not exists (
    select 1 from jsonb_array_elements(reasons) x
     where x->>'member_id' = m_active::text and x->>'reason' = 'already_ordered'
  ) then
    raise exception '유효 신청자의 제외 사유(already_ordered)가 없다: %', reasons;
  end if;

  -- 명단 연결 없던 과거 신청은 유일하게 특정되므로 연결만 하고 새로 만들지 않는다
  if not exists (
    select 1 from jsonb_array_elements(reasons) x
     where x->>'member_id' = m_legacy::text and x->>'reason' = 'linked_existing'
  ) then
    raise exception '과거 신청 연결(linked_existing)이 일어나지 않았다: %', reasons;
  end if;
  select count(*) into n from public.participants
   where group_member_id = m_legacy and delivery_id = d_legacy;
  if n <> 1 then raise exception '과거 신청이 명단에 연결되지 않았다 (n=%)', n; end if;

  -- 기존 기록은 보존된다 — 마음배송은 그대로 남아 있어야 한다
  if not exists (
    select 1 from public.participants
     where group_member_id = m_heart and type = '마음배송' and message = '축하해요'
  ) then
    raise exception '마음배송 기록이 사라지거나 덮어써졌다';
  end if;

  -- 동명이인 둘 다 등록된다 (이름만 같다고 합치거나 빠뜨리지 않는다)
  select count(*) into n from public.participants
   where delivery_id = (res->>'delivery_id')::uuid and name = '동명이인';
  if n <> 2 then raise exception '동명이인이 합쳐졌다 (n=%)', n; end if;

  ---------------------------------------------------------------------------
  -- 2) 관리자 생성 건은 알림이 발송 가능한 상태로 남지 않는다
  ---------------------------------------------------------------------------
  select count(*) into n
    from public.notification_outbox o
    join public.participants p on p.id = o.participant_id
   where p.delivery_id = (res->>'delivery_id')::uuid and o.status <> 'skipped';
  if n <> 0 then
    raise exception '관리자 생성 참여자의 outbox 가 발송 대기로 남았다 (n=%)', n;
  end if;

  ---------------------------------------------------------------------------
  -- 3) 멱등성 — 같은 request_key 재호출은 새 주문을 만들지 않는다
  ---------------------------------------------------------------------------
  res2 := public.admin_create_order_v1(
    'req-key-0001', g, null, null, '서울 강남', date '2026-09-20', '오후',
    null, '신랑', true);
  if (res2->>'delivery_id') <> (res->>'delivery_id') then
    raise exception '멱등성 위반 — 같은 키로 새 주문이 생겼다';
  end if;
  if (res2->>'reused') <> 'true' then
    raise exception '재사용 표시(reused)가 없다: %', res2;
  end if;
  select count(*) into n from public.deliveries
   where group_id = g and date = date '2026-09-20';
  if n <> 1 then raise exception '중복 주문이 생겼다 (n=%)', n; end if;

  ---------------------------------------------------------------------------
  -- 4) 서로 다른 제출은 계속 허용된다 (그룹을 통째로 잠그지 않는다)
  ---------------------------------------------------------------------------
  res2 := public.admin_create_order_v1(
    'req-key-0002', g, null, null, '서울 강남', date '2026-09-21', '오후',
    null, '신랑', false);
  if (res2->>'delivery_id') = (res->>'delivery_id') then
    raise exception '다른 제출인데 주문이 만들어지지 않았다';
  end if;

  ---------------------------------------------------------------------------
  -- 5) 대표자가 명단 구성원이면 중복 생성하지 않고 연결한다
  ---------------------------------------------------------------------------
  res2 := public.admin_create_order_v1(
    'req-key-0003', g, '취소이력', '010-1111-0001', '서울 강남',
    date '2026-09-22', '오후', null, '신랑', true);
  select count(*) into n from public.participants
   where delivery_id = (res2->>'delivery_id')::uuid and group_member_id = m_ok;
  if n <> 1 then
    raise exception '대표자와 명단 참여자가 중복 생성됐다 (n=%)', n;
  end if;
  if not exists (
    select 1 from public.participants
     where delivery_id = (res2->>'delivery_id')::uuid
       and group_member_id = m_ok and is_owner
  ) then
    raise exception '대표자가 명단 구성원으로 연결되지 않았다';
  end if;

  raise notice '문제 1·2 검증 통과 ✔';
end $t$;

---------------------------------------------------------------------------
-- 6) 원자성 — 참여자 저장을 실패시키면 주문도 남지 않는다
--    (트랜잭션 경계를 확인하려고 participants insert 를 막는 트리거를 잠깐 건다)
---------------------------------------------------------------------------
create or replace function public._t_boom() returns trigger
  language plpgsql as $b$ begin raise exception 'boom'; end $b$;

do $t$
declare g uuid; n int; ok boolean := false;
begin
  insert into public.groups (name, slug) values ('원자성', 'tst-atomic2') returning id into g;
  insert into public.group_members (group_id, name) values (g, '가'), (g, '나');

  create trigger _t_boom_trg before insert on public.participants
    for each row execute function public._t_boom();
  begin
    perform public.admin_create_order_v1(
      'req-key-boom', g, null, null, '서울', date '2026-09-23', '오후',
      null, '신랑', true);
  exception when others then
    ok := true;   -- 실패해야 정상
  end;
  drop trigger _t_boom_trg on public.participants;

  if not ok then raise exception '참여자 저장 실패가 오류로 전달되지 않았다'; end if;

  select count(*) into n from public.deliveries where group_id = g;
  if n <> 0 then raise exception '실패했는데 빈 주문이 남았다 (n=%)', n; end if;
  select count(*) into n from public.participants where group_id = g;
  if n <> 0 then raise exception '실패했는데 참여자 일부가 남았다 (n=%)', n; end if;
  -- 실패한 요청은 멱등 대장에도 남지 않아야 재시도가 가능하다
  select count(*) into n from public.admin_order_requests where request_key = 'req-key-boom';
  if n <> 0 then raise exception '실패한 요청이 멱등 대장에 남았다 (n=%)', n; end if;

  raise notice '원자성(롤백) 검증 통과 ✔';
end $t$;

drop function public._t_boom();
