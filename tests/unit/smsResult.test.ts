import { describe, expect, it } from "vitest";
import { describeSms, redactDigits } from "@/lib/smsResult";

/**
 * 2026-09-09 사고: 주문을 확정했더니 **"참여자 0/4명에게 SMS 발송 완료"** 가 떴다.
 * 한 건도 못 보냈는데 "완료"다. 실패 이유는 응답에 있었는데 화면이 버렸다.
 * 신랑신부는 하객 4명이 확정 문자를 받은 줄 알고 넘어갔다.
 *
 * 아래가 그 사고를 다시 못 나게 잡는 선이다.
 */
const fail = (n: number, error = "Solapi 401: unauthorized") =>
  Array.from({ length: n }, (_, i) => ({ name: `사람${i}`, ok: false, error }));

describe("describeSms", () => {
  it("전원 실패는 '완료'가 아니라 오류다 — 그 사고 그 자체", () => {
    const r = describeSms(
      { count: 4, sent: 0, skipped: false, results: fail(4) },
      "확정 처리"
    );
    expect(r.ok).toBe(false); // ← setNotice 가 아니라 setError 로 간다
    expect(r.text).not.toContain("완료");
    expect(r.text).toContain("전원 실패");
    expect(r.text).toContain("아직 아무 연락도 못 받았습니다");
    expect(r.text).toContain("Solapi 401"); // 사람이 조치하려면 이유가 보여야 한다
  });

  it("작업 자체는 됐다는 걸 문구에 남긴다 — 안 그러면 같은 작업을 또 한다", () => {
    const r = describeSms({ count: 2, sent: 0, skipped: false, results: fail(2) }, "확정 처리");
    expect(r.text).toContain("확정 처리는 됐지만");
  });

  it("일부만 갔어도 오류다 — 못 받은 사람이 있으면 조용히 넘기지 않는다", () => {
    const r = describeSms(
      { count: 4, sent: 1, skipped: false, results: [{ ok: true }, ...fail(3)] },
      "확정 처리"
    );
    expect(r.ok).toBe(false);
    expect(r.text).toContain("1명에게만");
    expect(r.text).toContain("나머지 3명은 못 받았습니다");
  });

  it("전부 성공해야 발송 완료", () => {
    const r = describeSms({ count: 3, sent: 3, skipped: false }, "확정 처리");
    expect(r.ok).toBe(true);
    expect(r.text).toContain("3명에게 SMS 발송 완료");
  });

  it("대상이 없거나 키 미설정이면 실패가 아니다 (의도된 미발송)", () => {
    expect(describeSms(null, "확정 처리").ok).toBe(true);
    expect(describeSms({ count: 0, sent: 0, skipped: false }, "확정 처리").ok).toBe(true);
    const skipped = describeSms({ count: 2, sent: 0, skipped: true }, "확정 처리");
    expect(skipped.ok).toBe(true);
    expect(skipped.text).toContain("키 미설정");
  });

  it("이유가 응답에 없으면 없다고 말한다 — 조용히 숨기지 않는다", () => {
    const r = describeSms({ count: 1, sent: 0, skipped: false, results: [{ ok: false }] }, "확정 처리");
    expect(r.ok).toBe(false);
    expect(r.text).toContain("사유가 응답에 없습니다");
  });

  it("실패가 여러 건이면 남은 건수를 알려준다", () => {
    const r = describeSms({ count: 3, sent: 0, skipped: false, results: fail(3) }, "확정 처리");
    expect(r.text).toContain("외 2건");
  });
});

describe("redactDigits", () => {
  it("오류 본문에 섞여 온 전화번호를 지운다 (스크린샷·버그리포트로 새면 안 된다)", () => {
    expect(redactDigits("to 010-9921-7467 rejected")).toBe("to *** rejected");
    expect(redactDigits("to 01099217467 rejected")).toBe("to *** rejected");
  });

  it("오류 코드 같은 짧은 숫자는 남긴다", () => {
    expect(redactDigits("Solapi 401: ValidationError")).toBe("Solapi 401: ValidationError");
  });
});
