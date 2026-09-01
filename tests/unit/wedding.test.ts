import { describe, it, expect } from "vitest";
import {
  slotsForDate,
  formatPhone,
  isValidPhone,
  formatYmdKo,
  toYmd,
  DELIVERY_START,
  DELIVERY_END,
} from "@/lib/wedding";

describe("slotsForDate", () => {
  it("주말은 오전·오후·저녁 전부", () => {
    expect(slotsForDate("2026-08-22")).toEqual(["오전", "오후", "저녁"]); // 토
    expect(slotsForDate("2026-08-23")).toEqual(["오전", "오후", "저녁"]); // 일
  });
  it("평일은 점심·저녁", () => {
    expect(slotsForDate("2026-08-21")).toEqual(["점심", "저녁"]); // 금
    expect(slotsForDate("2026-08-24")).toEqual(["점심", "저녁"]); // 월
  });
});

describe("formatPhone / isValidPhone", () => {
  it("숫자만 추출해 하이픈 포맷", () => {
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
    expect(formatPhone("010 1234 5678")).toBe("010-1234-5678");
    expect(formatPhone("0101234")).toBe("010-1234");
    expect(formatPhone("010")).toBe("010");
    expect(formatPhone("010123456789999")).toBe("010-1234-5678"); // 11자리 초과 절단
  });
  it("한국 휴대폰 형식만 유효", () => {
    expect(isValidPhone("010-1234-5678")).toBe(true);
    expect(isValidPhone("011-123-4567")).toBe(true);
    expect(isValidPhone(" 010-1234-5678 ")).toBe(true);
    expect(isValidPhone("02-1234-5678")).toBe(false);
    expect(isValidPhone("01012345678")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });
});

describe("배달 기간·날짜 포맷", () => {
  it("DELIVERY_START <= DELIVERY_END (문자열 비교로 범위 판정 가능)", () => {
    expect(DELIVERY_START <= DELIVERY_END).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(DELIVERY_START)).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(DELIVERY_END)).toBe(true);
  });
  it("범위 판정 — 경계 포함, 밖은 거부", () => {
    const inRange = (d: string) => d >= DELIVERY_START && d <= DELIVERY_END;
    expect(inRange(DELIVERY_START)).toBe(true);
    expect(inRange(DELIVERY_END)).toBe(true);
    expect(inRange("2026-07-05")).toBe(false);
    expect(inRange("2026-10-17")).toBe(false);
  });
  it("formatYmdKo / toYmd", () => {
    expect(formatYmdKo("2026-10-16")).toBe("10월 16일 (금)");
    expect(toYmd(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
