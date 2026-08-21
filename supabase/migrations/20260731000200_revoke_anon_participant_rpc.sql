-- =============================================================================
-- P0-2 (2단계) 참여자 관리 RPC 의 anon 실행권한 회수
--
-- ※ 반드시 새 클라이언트(v3 래퍼 + /api/delivery/manage 서버 라우트)가 배포된
--    뒤에 적용할 것. 그 전에 적용하면 구 클라이언트의 관리 페이지가 깨진다.
--    (1단계 20260731000100 은 추가 전용이라 구 클라이언트와 호환)
-- =============================================================================

-- anon 실행권한 회수 — 관리 mutation/조회는 서버(service_role) 경유로만.
--    (브라우저가 participant UUID 만으로 호출하던 경로 차단. 기능은 Next API 로 이전)
do $$
declare f text;
begin
  foreach f in array array[
    'public.get_participant(uuid)',
    'public.switch_participant(uuid,uuid)',
    'public.leave_delivery(uuid)',
    'public.convert_to_heart(uuid,text,text,text)',
    'public.propose_reschedule(uuid,date,text,text)',
    'public.respond_reschedule(uuid,boolean)',
    'public.reschedule_delivery_v2(uuid,date,text,text)',
    'public.submit_review_v2(uuid,integer,text)',
    'public.find_participants(text,text,date)',
    -- 원본 생성 RPC: 래퍼(v3/v2)를 통해서만 (토큰 발급 없이 생성되는 경로 차단)
    'public.create_delivery_v2(uuid,text,text,text,date,text,text,uuid,text)',
    'public.join_delivery(uuid,text,text,uuid)',
    'public.accept_group_offer(text,text,text,uuid)',
    'public.send_heart(uuid,text,text,text,text,text)',
    -- 레거시(v1)·내부 헬퍼 — 클라이언트 미사용, anon 노출 불필요
    'public.create_delivery(uuid,text,text,text,date,text,integer,text)',
    'public.cancel_delivery(uuid)',
    'public.reschedule_delivery(uuid,date,text)',
    'public.submit_review(uuid,integer,text)',
    'public.get_delivery(uuid)',
    'public.get_group_members(text)',
    'public._after_leave(uuid)',
    'public.verify_guest(text,text,date)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

