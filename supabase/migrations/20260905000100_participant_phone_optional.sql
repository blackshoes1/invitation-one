-- 관리자 일괄 신청 처리(그룹 명단 전원)를 위해 직접배달 참여자의 연락처 필수 조건 완화.
--
-- 배경: participants_delivery_shape 는 '직접배달이면 delivery_id·phone 모두 NOT NULL' 을
-- 요구했다. 하객이 직접 신청하는 경로는 폼·API 에서 연락처를 계속 검증하므로 그대로지만,
-- 관리자가 그룹 명단(대부분 연락처 미보유)을 주문에 일괄 등록할 때는 연락처가 없다.
-- delivery_id 요구는 유지하고 phone 요구만 없앤다 (제약 완화 — 기존 데이터는 모두 통과).
--
-- 연락처가 없는 참여자의 영향: SMS 발송 대상에서 자동 제외(.not phone is null),
-- '내 신청 찾기'(이름+끝 4자리)로는 조회되지 않음 — 관리자가 대신 관리한다.

alter table public.participants drop constraint if exists participants_delivery_shape;
alter table public.participants add constraint participants_delivery_shape
  check (type = '마음배송' or delivery_id is not null);
