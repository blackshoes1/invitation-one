/** 신청 성공 직후 관리자 카카오톡 알림 트리거 (fire-and-forget, 실패해도 무시) */
export function notifyAdmin(participantId: string | null | undefined) {
  if (!participantId) return;
  try {
    fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
