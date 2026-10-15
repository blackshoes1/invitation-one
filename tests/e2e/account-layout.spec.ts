import { test, expect } from "@playwright/test";

/**
 * 하객 안내 '마음 전하기'(view=accounts)에서 복사 버튼이 깨지던 것.
 * 여백이 세 겹 쌓인 카드 안이라 좁은 휴대폰·큰 글씨에서 계좌번호가 중간에 끊기고
 * 복사 버튼이 카드 밖으로 밀려 잘렸다. 번호는 한 줄, 버튼은 카드 안이어야 한다.
 */
for (const view of ["accounts", "photos"]) {
  for (const width of [280, 320, 390]) {
    test(`${view} · ${width}px · 큰 글씨: 복사 버튼과 계좌번호가 깨지지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?key=ci-dummy-key&view=${view}`);
      const buttons = page.getByRole("button", { name: /계좌번호 복사/ });
      await expect(buttons).toHaveCount(2);
      await buttons.first().scrollIntoViewIfNeeded();
      const rows = await buttons.evaluateAll((els) => els.map((b) => {
        const panel = b.closest(".collapsible")!.getBoundingClientRect();
        const r = b.getBoundingClientRect();
        const num = b.parentElement!.querySelector("p.font-mono") as HTMLElement;
        const n = num.getBoundingClientRect();
        const lineHeight = parseFloat(getComputedStyle(num).lineHeight);
        return {
          buttonInside: r.left >= panel.left - 1 && r.right <= panel.right + 1,
          buttonHeight: r.height,
          numberOneLine: Math.round(n.height / lineHeight) === 1,
          numberNoOverflow: num.scrollWidth <= num.clientWidth + 1 && n.right <= panel.right + 1,
          pageNoHScroll: document.documentElement.scrollWidth <= innerWidth,
        };
      }));
      for (const row of rows) {
        expect(row.buttonInside).toBe(true);
        expect(row.buttonHeight).toBeGreaterThanOrEqual(44);
        expect(row.numberOneLine).toBe(true);
        expect(row.numberNoOverflow).toBe(true);
        expect(row.pageNoHScroll).toBe(true);
      }
    });
  }
}
