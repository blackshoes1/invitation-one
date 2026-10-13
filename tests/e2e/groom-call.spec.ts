import { test, expect, type Page } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * 신랑에게 전화하기 — 번호는 **누를 때만** 풀린다.
 * 크롤러가 페이지·스크립트를 훑어도 전화번호가 나오지 않아야 한다.
 */
const DIGITS = "01066008145";
// 어떤 표기로든 (하이픈·공백·점) 번호가 보이면 안 된다
const PHONE_LIKE = /0\s*1\s*0[\s.-]*6\s*6\s*0\s*0[\s.-]*8\s*1\s*4\s*5/;
const OLD_VENUE = /02[\s.-]*792[\s.-]*5661/;

async function captureTel(page: Page) {
  await page.addInitScript(() => {
    // 실제로 전화 앱을 열지 않고, 열려던 주소만 기록한다
    HTMLAnchorElement.prototype.click = function () {
      document.documentElement.dataset.dialed = this.href;
    };
  });
}

test("청첩장 HTML 어디에도 신랑 번호·예식장 번호가 없다 (잠금 화면 · 본문)", async ({ page }) => {
  for (const url of ["/", "/?key=ci-dummy-key"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const html = await page.content();
    expect(html).not.toMatch(PHONE_LIKE);
    expect(html).not.toMatch(OLD_VENUE);
    expect(html).not.toContain("tel:");
  }
});

test("빌드된 JS 번들에도 번호 문자열이 없다", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".js") || p.endsWith(".html")) files.push(p);
    }
  };
  walk(".next/static");
  walk(".next/server/app");
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    expect(PHONE_LIKE.test(text), f).toBe(false);
    expect(text.includes(DIGITS), f).toBe(false);
  }
});

test("본문 '오시는 길'의 버튼을 누르면 신랑 번호로 전화가 걸린다", async ({ page }) => {
  await captureTel(page);
  await page.goto("/?key=ci-dummy-key");
  await page.getByRole("button", { name: /신랑 .*에게 전화하기/ }).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-dialed", `tel:${DIGITS}`);
  // 누른 뒤에도 전화 링크가 화면(DOM)에 남지 않는다
  expect(await page.content()).not.toContain('href="tel:');
});

test("잠금 화면에서도 신랑에게 전화할 수 있다", async ({ page }) => {
  await captureTel(page);
  await page.goto("/");
  const btn = page.getByRole("button", { name: /신랑 .*에게 전화하기/ });
  if ((await btn.count()) === 0) test.skip(true, "잠금 화면이 아닌 설정");
  await btn.first().click();
  await expect(page.locator("html")).toHaveAttribute("data-dialed", `tel:${DIGITS}`);
});
