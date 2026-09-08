/**
 * 관리자 주문 생성 결과 안내문 (문제 1).
 *
 * 예전에는 명단 등록이 **실패**해도 응답이 `{ added: 0, skipped: 전원 }` 이라
 * "명단은 모두 이미 신청돼 있어요" 로 보였다 — 실패가 정상적인 중복 제외와
 * 구분되지 않았다. 지금은 서버가 사유를 코드로 내려주므로 여기서 풀어 쓰고,
 * 사람을 특정하지 못한 건은 확인 필요로 따로 드러낸다.
 * (실제 실패는 이제 200 이 아니라 4xx/5xx 로 온다 — 이 함수까지 오지 않는다)
 */
export interface RosterNote {
  member_id: string;
  name: string;
  reason: string;
}

export interface AdminOrderResponse {
  with_owner?: boolean;
  reused?: boolean;
  roster_added?: number;
  roster_linked?: number;
  roster_skipped_detail?: RosterNote[];
  roster_review?: RosterNote[];
}

/** 서버(admin_create_order_v1)가 내려주는 제외 사유 코드 → 사람이 읽는 말 */
export const SKIP_LABEL: Record<string, string> = {
  owner: "대표자로 등록",
  already_on_order: "이미 이 주문에 있음",
  already_ordered: "다른 주문에 신청 중",
  linked_existing: "기존 신청을 명단에 연결",
};

export function orderNotice(j: AdminOrderResponse, includeRoster: boolean): string {
  if (j.reused)
    return "이미 처리된 요청이에요 — 같은 주문을 다시 만들지 않았어요.";

  const head = j.with_owner
    ? "주문을 만들었어요 🛵 주문 탭·캘린더에서 확인할 수 있어요."
    : "빈 주문(슬롯)을 만들었어요 — 그룹 페이지에서 멤버가 합류할 수 있어요.";
  if (!includeRoster) return head;

  const added = Number(j.roster_added ?? 0);
  const skipped = j.roster_skipped_detail ?? [];
  const review = j.roster_review ?? [];

  const parts: string[] = [
    added > 0
      ? ` 명단 ${added}명을 신청 처리했어요.`
      : " 새로 신청 처리한 명단 인원은 없어요.",
  ];

  const byReason = new Map<string, string[]>();
  for (const s of skipped) {
    const list = byReason.get(s.reason) ?? [];
    list.push(s.name);
    byReason.set(s.reason, list);
  }
  for (const [reason, names] of byReason)
    parts.push(` ${SKIP_LABEL[reason] ?? reason}: ${names.join(", ")}.`);

  if (review.length > 0)
    parts.push(
      ` ⚠️ 확인 필요 — 같은 이름의 기존 신청이 있어 사람을 특정하지 못했어요: ${review
        .map((r) => r.name)
        .join(", ")}. 주문 탭에서 중복 여부를 확인해주세요.`
    );
  return head + parts.join("");
}
