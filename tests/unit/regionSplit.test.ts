import { describe, expect, it } from "vitest";
import { joinLocation, splitRegion, sidoOf } from "@/lib/regions";

/**
 * 관리자가 신청 뒤에 장소를 고치는 화면은 저장된 문자열을 다시 시/도·시/군/구로
 * 갈라서 보여준다. 여기서 제일 위험한 건 **원래 적혀 있던 글자를 잃는 것**이다.
 *
 * 장소는 예전에 자유 입력이었다 — "강남구 또는 암데나" 같은 값이 실제로 남아 있다.
 * 그런 값을 못 알아본다고 빈칸으로 열어 주면, 관리자가 시간대만 고치고 저장하는
 * 순간 하객이 적어둔 장소가 조용히 지워진다.
 */
describe("splitRegion", () => {
  it("하객이 고른 형식은 그대로 갈라진다", () => {
    expect(splitRegion("서울 강남구")).toEqual({ sido: "서울", sub: "강남구", detail: "" });
  });

  it("상세가 붙어 있으면 시/도·시/군/구 뒤 전부가 상세다", () => {
    expect(splitRegion("서울 강남구 강남역 2번 출구")).toEqual({
      sido: "서울", sub: "강남구", detail: "강남역 2번 출구",
    });
  });

  it("못 알아본 옛 자유 입력은 통째로 상세에 남는다 — 글자를 버리지 않는다", () => {
    expect(splitRegion("강남구 또는 암데나")).toEqual({
      sido: "", sub: "", detail: "강남구 또는 암데나",
    });
  });

  it("시/도는 맞는데 뒤가 시/군/구가 아니면 시/도만 살리고 나머지는 상세로", () => {
    // '서울역'은 서울의 시/군/구 목록에 없다 — 버리지 말고 상세로 넘긴다
    expect(splitRegion("서울 서울역 앞")).toEqual({
      sido: "서울", sub: "", detail: "서울역 앞",
    });
  });

  it("같은 이름의 구가 여러 시/도에 있어도 고른 시/도 기준으로 본다", () => {
    // '중구'는 서울·부산·대구에 다 있다
    expect(splitRegion("부산 중구")).toEqual({ sido: "부산", sub: "중구", detail: "" });
  });

  it("비어 있거나 null 이면 빈 값 — 장소 미정인 주문도 열려야 한다", () => {
    expect(splitRegion(null)).toEqual({ sido: "", sub: "", detail: "" });
    expect(splitRegion("   ")).toEqual({ sido: "", sub: "", detail: "" });
  });
});

describe("joinLocation", () => {
  it("상세가 없으면 하객이 고른 것과 같은 문자열이 된다", () => {
    expect(joinLocation("서울", "강남구", "")).toBe("서울 강남구");
  });

  it("갈랐다 합치면 원래대로 (상세 포함)", () => {
    const raw = "경기 성남시 판교역 4번 출구";
    const { sido, sub, detail } = splitRegion(raw);
    expect(joinLocation(sido, sub, detail)).toBe(raw);
  });

  it("첫 낱말이 시/도로 남아야 배송경로 지도에 핀이 붙는다", () => {
    // 이게 어드민 장소를 자유 입력으로 두지 않는 이유다
    expect(sidoOf(joinLocation("부산", "해운대구", "해운대역"))).toBe("부산");
    expect(sidoOf("강남구 또는 암데나")).toBeNull();
  });
});
