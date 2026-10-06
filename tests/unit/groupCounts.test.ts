import { describe, it, expect } from "vitest";
import { tallyParticipants, type ParticipantTally } from "@/lib/groupCounts";

/**
 * 문제 6 — 집계 정의를 코드로 고정한다 (docs/COUNTING.md).
 *
 * 예전에는 그룹 카드의 "신청 n명" 하나에 직접배달과 마음배송이 섞여 있었고,
 * 명단 배지는 취소·마음배송까지 "신청함"으로 표시해 카드와 배지가 서로 다른
 * 뜻을 갖고 있었다.
 */
const G = "g1";
const order = (gid: string | null, status = "대기중"): ParticipantTally => ({
  group_id: gid,
  type: "직접배달",
  delivery: { status },
});
const heart = (gid: string | null): ParticipantTally => ({
  group_id: gid,
  type: "마음배송",
  delivery: null,
});

describe("tallyParticipants", () => {
  it("직접배달 5 + 마음배송 1 + 취소 직접배달 2 → 5 · 1 · 합 6", () => {
    const rows = [
      ...Array.from({ length: 5 }, () => order(G)),
      heart(G),
      order(G, "취소"),
      order(G, "취소"),
    ];
    const { byGroup, totals } = tallyParticipants(rows);
    expect(byGroup.get(G)).toEqual({ orders: 5, hearts: 1 });
    expect(totals).toEqual({ orders: 5, hearts: 1, records: 6 });
  });

  it("취소만 있는 그룹은 직접배달 0 — 유효 신청자로 세지 않는다", () => {
    const { byGroup, totals } = tallyParticipants([order(G, "취소")]);
    expect(byGroup.get(G)?.orders ?? 0).toBe(0);
    expect(totals.orders).toBe(0);
  });

  it("완료 주문은 포함하고 숨김은 취소처럼 다루지 않는다", () => {
    // 숨김은 deliveries.hidden 이라 status 에 나타나지 않는다 — 상태만 보고 세면
    // 자연히 포함된다. 이 테스트는 그 의도를 고정한다.
    const { totals } = tallyParticipants([order(G, "완료"), order(G, "확정")]);
    expect(totals.orders).toBe(2);
  });

  it("같은 사람의 두 기록은 합쳐지지 않는다 — 기록 수이지 고유 인원이 아니다", () => {
    // 마음배송을 보낸 뒤 직접배달을 신청한 한 사람 = 2건
    const { byGroup, totals } = tallyParticipants([heart(G), order(G)]);
    expect(byGroup.get(G)).toEqual({ orders: 1, hearts: 1 });
    expect(totals.records).toBe(2);
  });

  it("개인 링크 신청(group_id 없음)은 그룹 집계에 합산되지 않고 전체에는 들어간다", () => {
    const { byGroup, totals } = tallyParticipants([order(G), order(null), heart(null)]);
    expect(byGroup.get(G)).toEqual({ orders: 1, hearts: 0 });
    expect(totals).toEqual({ orders: 2, hearts: 1, records: 3 });
    // 그룹 합보다 전체가 크다 = "그룹 외"가 있다는 뜻
    expect(totals.records - 1).toBe(2);
  });

  it("취소된 마음배송이라는 것은 없다 — 주문이 없으므로 전부 센다", () => {
    const { totals } = tallyParticipants([heart(G), heart(G)]);
    expect(totals.hearts).toBe(2);
  });

  it("빈 입력은 0 이지만, 이는 '못 세었음'과 다르다 (호출부가 오류를 따로 처리한다)", () => {
    expect(tallyParticipants([]).totals).toEqual({ orders: 0, hearts: 0, records: 0 });
  });
});
