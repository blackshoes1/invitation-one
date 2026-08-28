import { describe, it, expect } from "vitest";
import {
  ANON_ADJECTIVES,
  ANON_ANIMALS,
  isValidAnonAlias,
  randomAnonAlias,
} from "@/lib/anonAlias";

describe("isValidAnonAlias (P1-3 서버 검증)", () => {
  it("허용 목록 조합은 통과한다", () => {
    expect(isValidAnonAlias("수줍은 펭귄")).toBe(true);
    expect(isValidAnonAlias("다정한 수달")).toBe(true);
    expect(isValidAnonAlias(`${ANON_ADJECTIVES[19]} ${ANON_ANIMALS[19]}`)).toBe(true);
  });

  it("randomAnonAlias 결과는 항상 유효하다", () => {
    for (let i = 0; i < 50; i++) expect(isValidAnonAlias(randomAnonAlias())).toBe(true);
  });

  it("목록 밖 한글 문구는 형식이 맞아도 거부한다 (regex 우회 차단)", () => {
    expect(isValidAnonAlias("공짜 쿠폰")).toBe(false);
    expect(isValidAnonAlias("수줍은 사기꾼")).toBe(false);
    expect(isValidAnonAlias("이상한 펭귄")).toBe(false);
  });

  it("형식 불량·비문자열은 거부한다", () => {
    expect(isValidAnonAlias("수줍은펭귄")).toBe(false); // 공백 없음
    expect(isValidAnonAlias("수줍은  펭귄")).toBe(false); // 이중 공백
    expect(isValidAnonAlias("수줍은 펭귄 왕")).toBe(false); // 3어절
    expect(isValidAnonAlias("")).toBe(false);
    expect(isValidAnonAlias(null)).toBe(false);
    expect(isValidAnonAlias(undefined)).toBe(false);
    expect(isValidAnonAlias(123)).toBe(false);
  });
});
