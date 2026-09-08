-- =============================================================================
-- P1-6 권한·시그니처 스모크 테스트
-- 빈 DB 에 레거시(db/*.sql) → supabase/migrations 전체를 적용한 뒤 실행한다
-- (scripts/db-verify.sh). 위반이 있으면 exception 으로 중단 → CI 실패.
--
-- ⚠️ 운영 DB 에 20260828000200(회수)이 아직 적용되지 않은 시점에 돌리면
--    write RPC 4종의 anon=false 단언이 (의도대로) 실패한다.
-- =============================================================================

do $$
declare
  bad text := '';
  r record;
  cnt int;
  found int;
  -- anon 이 실행할 수 없어야 하는 함수 이름 (모든 오버로드에 대해 검사)
  deny_names text[] := array[
    -- 서버 전용 내부 헬퍼
    '_issue_manage_token', '_participant_by_token', '_invite_phone', '_after_leave',
    'rl_hit', 'claim_notifications',
    -- 참여자 관리 (Next API 경유 전용 — 20260731000200)
    'get_participant', 'switch_participant', 'leave_delivery', 'convert_to_heart',
    'propose_reschedule', 'respond_reschedule', 'reschedule_delivery_v2',
    'submit_review_v2', 'find_participants',
    -- 원본/레거시 생성 RPC
    'create_delivery_v2', 'join_delivery', 'accept_group_offer', 'send_heart',
    'create_delivery', 'cancel_delivery', 'reschedule_delivery', 'submit_review',
    'get_delivery', 'get_group_members', 'verify_guest',
    -- 체크인 v1/RSVP 레거시 (v24)
    'submit_rsvp', 'submit_checkin', 'submit_rsvp_v2',
    -- P1-1 에서 Next API 뒤로 옮긴 공개 write RPC (20260828000200)
    'send_heart_v2', 'create_delivery_v3', 'join_delivery_v2', 'accept_group_offer_v2',
    -- 관리자 전용 (20260907000100) — 하객 경로에서 절대 호출되지 않는다
    'admin_create_order_v1'
  ];
  -- anon 이 실행할 수 있어야 하는 공개 read RPC
  allow_names text[] := array[
    'get_celebrations', 'get_booked_dates', 'get_group', 'get_group_orders',
    'get_delivery_guest_count', 'get_orders_on_date', 'get_checkin_summary',
    'get_site_settings', 'get_guest_photos', 'verify_guest_v2'
  ];
  -- Next API(service_role)가 호출해야 하는 write RPC
  service_names text[] := array[
    'send_heart_v2', 'create_delivery_v3', 'join_delivery_v2', 'accept_group_offer_v2',
    'admin_create_order_v1'
  ];
  -- PostgREST 오버로드 모호성이 생기면 안 되는 함수 (정확히 1개 시그니처)
  unique_names text[] := array[
    'send_heart_v2', 'create_delivery_v3', 'join_delivery_v2', 'accept_group_offer_v2',
    'admin_create_order_v1'
  ];
  n text;
begin
  -- 1) deny: 존재해야 하고, 어떤 오버로드도 anon 실행 불가
  foreach n in array deny_names loop
    found := 0;
    for r in
      select p.oid from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname = n
    loop
      found := found + 1;
      if has_function_privilege('anon', r.oid, 'execute') then
        bad := bad || format('[deny] %s anon=execute; ', n);
      end if;
    end loop;
    if found = 0 then
      bad := bad || format('[deny] %s 함수 없음(시그니처/마이그레이션 확인); ', n);
    end if;
  end loop;

  -- 2) allow: 존재해야 하고, 최소 하나의 오버로드가 anon 실행 가능
  foreach n in array allow_names loop
    select count(*) filter (where has_function_privilege('anon', p.oid, 'execute')),
           count(*)
      into cnt, found
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = n;
    if found = 0 then
      bad := bad || format('[allow] %s 함수 없음; ', n);
    elsif cnt = 0 then
      bad := bad || format('[allow] %s anon 실행 불가(공개 read 깨짐); ', n);
    end if;
  end loop;

  -- 3) service_role: write RPC 는 service_role 이 실행 가능해야 함
  foreach n in array service_names loop
    select count(*) filter (where has_function_privilege('service_role', p.oid, 'execute'))
      into cnt
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = n;
    if coalesce(cnt, 0) = 0 then
      bad := bad || format('[service] %s service_role 실행 불가; ', n);
    end if;
  end loop;

  -- 4) 오버로드 유일성 — drop 후 재생성 누락 시 PostgREST 모호성 발생
  foreach n in array unique_names loop
    select count(*) into cnt
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = n;
    if cnt <> 1 then
      bad := bad || format('[overload] %s 시그니처 %s개(1개여야 함); ', n, cnt);
    end if;
  end loop;

  if bad <> '' then
    raise exception '권한/시그니처 검증 실패: %', bad;
  end if;
  raise notice '권한/시그니처 검증 통과 ✔ (deny %, allow %, unique %)',
    array_length(deny_names, 1), array_length(allow_names, 1), array_length(unique_names, 1);
end $$;
