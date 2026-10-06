import { describe, it, expect } from "vitest";
import { orderNotice } from "@/lib/adminOrderNotice";

/**
 * 문제 1 회귀 방지 — 명단 등록 **실패**가 정상적인 중복 제외처럼 보이면 안 된다.
 *
 * 예전 응답은 실패해도 `{ roster_added: 0, roster_skipped: 전원 }` 이었고 화면에는
 * "명단은 모두 이미 신청돼 있어요" 가 떴다. 관리자는 등록이 끝난 줄 알았다.
 * 지금은 실패가 4xx/5xx 로 오고, 200 응답의 제외는 반드시 사유가 붙는다.
 */
describe("orderNotice", () => {
  it("제외는 사유별로 이름과 함께 설명한다", () => {
    const s = orderNotice(
      {
        with_owner: false,
        roster_added: 2,
        roster_skipped_detail: [
          { member_id: "1", name: "가", reason: "already_ordered" },
          { member_id: "2", name: "나", reason: "already_ordered" },
          { member_id: "3", name: "다", reason: "owner" },
        ],
      },
      true
    );
    expect(s).toContain("명단 2명을 신청 처리했어요");
    expect(s).toContain("다른 주문에 신청 중: 가, 나");
    expect(s).toContain("대표자로 등록: 다");
  });

  it("아무도 등록되지 않아도 '모두 이미 신청됨'이라고 단정하지 않는다", () => {
    // 0명 등록이 곧 "전원 중복"은 아니다 — 사유가 곧 근거다
    const s = orderNotice({ roster_added: 0, roster_skipped_detail: [] }, true);
    expect(s).toContain("새로 신청 처리한 명단 인원은 없어요");
    expect(s).not.toContain("모두 이미 신청");
  });

  it("사람을 특정 못 한 건은 확인 필요로 드러낸다", () => {
    const s = orderNotice(
      {
        roster_added: 1,
        roster_review: [{ member_id: "9", name: "동명", reason: "ambiguous_existing" }],
      },
      true
    );
    expect(s).toContain("⚠️ 확인 필요");
    expect(s).toContain("동명");
  });

  it("멱등 재사용은 새 주문을 만들지 않았다고 알린다", () => {
    expect(orderNotice({ reused: true, with_owner: true }, true)).toContain(
      "다시 만들지 않았어요"
    );
  });

  it("명단 일괄을 끄면 명단 문구를 붙이지 않는다", () => {
    const s = orderNotice({ with_owner: true, roster_added: 0 }, false);
    expect(s).toBe("주문을 만들었어요 🛵 주문 탭·캘린더에서 확인할 수 있어요.");
  });

  it("모르는 사유 코드도 이름과 함께 보여준다 (조용히 삼키지 않는다)", () => {
    const s = orderNotice(
      { roster_added: 0, roster_skipped_detail: [{ member_id: "1", name: "가", reason: "brand_new" }] },
      true
    );
    expect(s).toContain("brand_new: 가");
  });
});
