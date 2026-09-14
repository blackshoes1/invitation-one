import { describe, expect, it } from "vitest";
import { paymentAppUrl, paymentUrl } from "@/lib/paymentLinks";
import { accounts } from "@/lib/wedding";

describe("payment links", () => {
  it("keeps the bank account without a KakaoPay recipient link", () => {
    expect(accounts[0].kakaoPayUrl).toBeUndefined();
    expect(accounts[0].bank).toBe("카카오뱅크");
    expect(accounts[0].number).toBe("3333-37-8660608");
  });
  it("opens the selected app when no personal payment URL is configured", () => {
    expect(paymentAppUrl("kakao")).toBe("kakaopay://");
    expect(paymentAppUrl("toss")).toBe("supertoss://");
  });
  it("preserves configured HTTPS recipient links", () => {
    expect(paymentAppUrl("toss", "https://toss.im/example")).toBe("https://toss.im/example");
  });
  it("rejects arbitrary schemes instead of executing them", () => {
    for (const value of ["javascript:alert(1)", "intent://arbitrary", "http://example.com", "invalid"]) {
      expect(paymentUrl("kakao", value)).toBeUndefined();
      expect(paymentAppUrl("kakao", value)).toBe("kakaopay://");
    }
  });
});
