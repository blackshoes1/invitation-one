/**
 * 신청 성공 직후 관리자 카카오톡 알림 드레인 신호 (fire-and-forget, 실패해도 무시).
 * P1-3: 알림 내용은 DB 트리거가 outbox 에 적재하므로 participant_id 를 보내지 않는다.
 * 이 호출이 유실돼도 다음 신청/크론에서 함께 발송된다.
 */
export function notifyAdmin() {
  try {
    fetch("/api/notify", { method: "POST", keepalive: true }).catch(() => {});
  } catch {
    /* ignore */
  }
}
