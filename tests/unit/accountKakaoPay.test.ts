import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Account from "@/components/sections/Account";

const accounts = vi.hoisted(() => [
  { role: "신랑", name: "성근영", bank: "카카오뱅크", number: "3333-37-8660608", kakaoPayUrl: undefined as string | undefined },
  { role: "신부", name: "김아영", bank: "카카오뱅크", number: "3333-28-8939945", kakaoPayUrl: undefined as string | undefined },
]);
vi.mock("@/lib/wedding", () => ({ accounts }));

beforeEach(() => {
  for (const account of accounts) account.kakaoPayUrl = undefined;
});

function paymentLinks() {
  return renderToStaticMarkup(createElement(Account)).match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
}

describe("카카오페이 수취인 연결", () => {
  it("송금 링크가 없으면 계좌 복사를 유지하고 송금 버튼은 숨긴다", () => {
    const html = renderToStaticMarkup(createElement(Account));
    expect(paymentLinks()).toHaveLength(0);
    for (const account of accounts) {
      expect(html).toContain(`${account.name} 계좌번호 복사`);
      expect(html).toContain(account.number);
    }
  });

  it("신부 링크만 설정하면 신부 송금 버튼만 표시한다", () => {
    accounts[1].kakaoPayUrl = "https://qr.kakaopay.com/test-bride";
    const links = paymentLinks();
    expect(links).toHaveLength(1);
    expect(links[0]).toContain('href="https://qr.kakaopay.com/test-bride"');
    expect(links[0]).toContain('aria-label="김아영 카카오페이 송금하기"');
  });

  it("신랑·신부의 송금 버튼이 각각 해당 수취인의 링크를 연다", () => {
    accounts[0].kakaoPayUrl = "https://qr.kakaopay.com/test-groom";
    accounts[1].kakaoPayUrl = "https://qr.kakaopay.com/test-bride";
    const links = paymentLinks();
    expect(links).toHaveLength(2);
    for (const [index, account] of accounts.entries()) {
      expect(links[index]).toContain(`href="${account.kakaoPayUrl}"`);
      expect(links[index]).toContain(`aria-label="${account.name} 카카오페이 송금하기"`);
      expect(links[index]).toContain('target="_blank"');
      expect(links[index]).toContain('rel="noopener noreferrer"');
    }
  });
});
