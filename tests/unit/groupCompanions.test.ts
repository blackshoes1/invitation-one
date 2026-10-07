import { describe, it, expect } from "vitest";
import {
  MAX_COMPANIONS,
  clampCompanionCount,
  formatCompanions,
  normalizeCompanions,
  resizeCompanions,
} from "@/lib/groupCompanions";

describe("clampCompanionCount", () => {
  it("정수는 그대로, 소수·문자열 숫자는 정수로", () => {
    expect(clampCompanionCount(3)).toBe(3);
    expect(clampCompanionCount(2.9)).toBe(2);
    expect(clampCompanionCount("4")).toBe(4);
  });
  it("음수·NaN·숫자가 아닌 값은 0", () => {
    expect(clampCompanionCount(-2)).toBe(0);
    expect(clampCompanionCount(Number.NaN)).toBe(0);
    expect(clampCompanionCount("abc")).toBe(0);
    expect(clampCompanionCount(undefined)).toBe(0);
    expect(clampCompanionCount(null)).toBe(0);
  });
  it("상한은 MAX_COMPANIONS (본인 포함 20명)", () => {
    expect(clampCompanionCount(99)).toBe(MAX_COMPANIONS);
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

describe("resizeCompanions", () => {
  it("늘리면 빈 칸을 뒤에 붙이고 기존 이름은 유지", () => {
    expect(resizeCompanions(["김철수"], 3)).toEqual(["김철수", "", ""]);
  });
  it("줄이면 뒤에서부터 자름", () => {
    expect(resizeCompanions(["김철수", "이영희", "박민수"], 1)).toEqual(["김철수"]);
  });
  it("0 이면 빈 배열, 범위를 벗어난 값은 보정", () => {
    expect(resizeCompanions(["김철수"], 0)).toEqual([]);
    expect(resizeCompanions([], -3)).toEqual([]);
    expect(resizeCompanions([], 99)).toHaveLength(MAX_COMPANIONS);
  });
  it("입력 배열을 바꾸지 않는다", () => {
    const src = ["김철수"];
    resizeCompanions(src, 3);
    expect(src).toEqual(["김철수"]);
  });
});

describe("formatCompanions", () => {
  it("동반자 없음 → 빈 문자열", () => {
    expect(formatCompanions(0, [])).toBe("");
  });
  it("이름이 없으면 인원만", () => {
    expect(formatCompanions(2, [])).toBe("외 2명");
    expect(formatCompanions(2, ["", ""])).toBe("외 2명");
  });
  it("이름이 있으면 괄호로 — 인원은 count 기준 (이름이 일부만 있어도)", () => {
    expect(formatCompanions(2, ["김철수", "이영희"])).toBe("외 2명 (김철수, 이영희)");
    expect(formatCompanions(2, ["김철수", ""])).toBe("외 2명 (김철수)");
  });
});
