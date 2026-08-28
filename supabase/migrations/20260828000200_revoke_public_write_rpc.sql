-- P1-1: 공개 write RPC 의 브라우저(anon) 직접 호출 회수
--
-- ⚠️ 적용 순서 주의 — 반드시 "새 앱 배포가 완료된 뒤" 적용할 것.
--    구 클라이언트는 이 RPC 들을 브라우저에서 직접 호출하므로, 배포 전에
--    회수하면 마음배송·직접배달 신청·합류·제안 수락이 전부 깨진다.
--
--    STEP 1: 20260828000100(연결 컬럼) 적용 — 아무 때나 안전
--    STEP 2: 새 앱 배포 (/api/delivery/heart·create·join·group/accept 경유)
--    STEP 3: 이 마이그레이션 적용
--
-- 함수 EXECUTE 는 기본적으로 PUBLIC 에 부여되므로 anon 만 회수해서는
-- PUBLIC 경유로 여전히 호출 가능 — public·anon·authenticated 모두 회수한다.
-- (v24_1_revoke_public_execute 에서 확인된 패턴)
-- service_role 은 직접 grant 로 유지 → Next API(service key)만 호출 가능.

revoke execute on function public.send_heart_v2(
  uuid, text, text, text, text, text, text, boolean, boolean, text, text
) from public, anon, authenticated;
grant execute on function public.send_heart_v2(
  uuid, text, text, text, text, text, text, boolean, boolean, text, text
) to service_role;

revoke execute on function public.create_delivery_v3(
  uuid, text, text, text, date, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_delivery_v3(
  uuid, text, text, text, date, text, text, text, text, text
) to service_role;

revoke execute on function public.join_delivery_v2(
  uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.join_delivery_v2(
  uuid, text, text, text, text
) to service_role;

revoke execute on function public.accept_group_offer_v2(
  text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.accept_group_offer_v2(
  text, text, text, text, text
) to service_role;
