import { describe, it, expect } from "vitest";
import {
  MAX_COMPANIONS,
  companionSlots,
  formatRosterLabel,
  normalizeCompanions,
} from "@/lib/groupCompanions";

describe("companionSlots", () => {
  it("인원 - 1 (본인 제외)", () => {
    expect(companionSlots(1)).toBe(0);
    expect(companionSlots(3)).toBe(2);
  });
  it("0·음수·NaN 은 0, 상한은 MAX_COMPANIONS", () => {
    expect(companionSlots(0)).toBe(0);
    expect(companionSlots(-4)).toBe(0);
    expect(companionSlots(Number.NaN)).toBe(0);
    expect(companionSlots(99)).toBe(MAX_COMPANIONS);
  });
});

describe("normalizeCompanions", () => {
  it("배열이 아니면 빈 배열", () => {
    expect(normalizeCompanions(undefined)).toEqual([]);
    expect(normalizeCompanions("김철수")).toEqual([]);
    expect(normalizeCompanions({ 0: "x" })).toEqual([]);
  });
  it("공백 제거, 빈 이름은 빈 칸으로 유지 (인원 수 보존)", () => {
    expect(normalizeCompanions([" 김철수 ", "", "  "])).toEqual(["김철수", "", ""]);
  });
  it("문자열이 아닌 값은 빈 칸, 이름은 40자로 자름", () => {
    expect(normalizeCompanions([1, null, "가".repeat(60)])).toEqual(["", "", "가".repeat(40)]);
  });
  it("최대 MAX_COMPANIONS 명까지만", () => {
    expect(normalizeCompanions(Array(30).fill("a"))).toHaveLength(MAX_COMPANIONS);
  });
});

describe("formatRosterLabel", () => {
  it("동반자 없음 → 이름만", () => {
    expect(formatRosterLabel("홍길동", [])).toBe("홍길동");
  });
  it("이름 있는 동반자는 괄호로, 인원은 전체 칸 수 기준", () => {
    expect(formatRosterLabel("홍길동", ["김철수", "이영희"])).toBe("홍길동 외 2명 (김철수, 이영희)");
  });
  it("이름이 비어 있으면 인원만 표시", () => {
    expect(formatRosterLabel("홍길동", ["", ""])).toBe("홍길동 외 2명");
    expect(formatRosterLabel("홍길동", ["김철수", ""])).toBe("홍길동 외 2명 (김철수)");
  });
});
