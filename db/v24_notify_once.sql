-- Supabase SQL Editor 에서 실행. (v23 이후)
-- 신규 신청 카카오 알림 1회 발송 보장.
--
-- 배경: /api/notify 는 인증 없는 공개 엔드포인트로, participant_id(신청자
--       브라우저에 노출)만 알면 호출 가능했다. "10분 내 생성" 체크만으로는
--       그 10분 동안 무한 재호출(관리자 카톡 폭탄·카카오 쿼터 소진)을 막지
--       못하므로, 발송 시각을 기록해 원자적으로 1회만 발송한다.
--       (라우트에서 update … where notified_at is null 로 클레임)

alter table public.participants
  add column if not exists notified_at timestamptz;
