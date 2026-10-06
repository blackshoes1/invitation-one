/**
 * 그룹 신청 집계 (문제 6) — 정의는 docs/COUNTING.md.
 *
 * 세는 대상이 서로 다르다는 것이 핵심이다:
 *   명단 인원 = 사람 수 (group_members)
 *   신청      = **기록 수** (participants). 같은 사람이 마음배송 뒤 직접배달을
 *              신청하면 2건이다 — 고유 인원도 식수도 아니다.
 *
 * 이름만으로 중복 제거하지 않는다 (동명이인이 한 사람으로 합쳐진다).
 */
export interface ParticipantTally {
  group_id: string | null;
  type: string;
  /** 직접배달이면 주문 상태 (마음배송은 주문이 없어 null) */
  delivery: { status: string } | null;
}

export interface GroupTally {
  /** 취소되지 않은 직접배달 기록 수 */
  orders: number;
  /** 마음배송 기록 수 */
  hearts: number;
}

export interface TallyResult {
  /** group_id → 집계. 개인 링크 신청(group_id 없음)은 여기 들어가지 않는다 */
  byGroup: Map<string, GroupTally>;
  /** 그룹 미지정까지 포함한 전체 */
  totals: { orders: number; hearts: number; records: number };
}

export function tallyParticipants(rows: ParticipantTally[]): TallyResult {
  const byGroup = new Map<string, GroupTally>();
  let orders = 0;
  let hearts = 0;

  const slot = (gid: string): GroupTally => {
    let g = byGroup.get(gid);
    if (!g) {
      g = { orders: 0, hearts: 0 };
      byGroup.set(gid, g);
    }
    return g;
  };

  for (const p of rows) {
    if (p.type === "마음배송") {
      // 마음배송은 주문이 없어 취소 개념이 없다 — 전부 센다
      hearts++;
      if (p.group_id) slot(p.group_id).hearts++;
      continue;
    }
    // 취소된 직접배달은 제외. 숨김(hidden)은 표시용이라 취소처럼 다루지 않는다.
    if (p.delivery?.status === "취소") continue;
    orders++;
    if (p.group_id) slot(p.group_id).orders++;
  }

  return { byGroup, totals: { orders, hearts, records: orders + hearts } };
}
