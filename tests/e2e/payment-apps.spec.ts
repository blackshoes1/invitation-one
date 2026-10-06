import { test, expect } from "@playwright/test";

test("account offers only copying, without payment app links", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => {
      document.documentElement.dataset.copiedAccount = text;
    } } });
  });
  await page.goto("/?key=ci-dummy-key");
  await page.getByRole("button", { name: "마음 전하기 · 계좌 보기" }).click();
  await expect(page.getByRole("link", { name: /카카오페이|토스로 보내기|설치 안내/ })).toHaveCount(0);
  const copy = page.getByRole("button", { name: /계좌번호 복사/ });
  await expect(copy).toHaveCount(1);
  await copy.click();
  await expect(page.locator("html")).toHaveAttribute("data-copied-account", "3333-37-8660608");
  await expect(page.getByText("계좌번호를 복사했어요. 은행 앱에서 이체해주세요.")).toBeVisible();
  await expect(page).toHaveURL(/\?key=ci-dummy-key/);
});

test("mobile copy failure keeps account visible without navigation", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("denied"); } } });
    document.execCommand = () => false;
  });
  await page.goto("/?key=ci-dummy-key");
  await page.getByRole("button", { name: "마음 전하기 · 계좌 보기" }).click();
  await page.getByRole("button", { name: /계좌번호 복사/ }).click();
  await expect(page.getByText("복사하지 못했어요. 위 계좌번호를 직접 입력해주세요.")).toBeVisible();
  await expect(page.getByText("3333-37-8660608", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\?key=ci-dummy-key/);
  await context.close();
});
