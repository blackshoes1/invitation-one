import { test, expect } from "@playwright/test";

test("payment buttons have app links and desktop keeps copy fallback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} } });
  });
  await page.goto("/?key=ci-dummy-key");
  await page.getByRole("button", { name: "마음 전하기 · 계좌 보기" }).click();
  await expect(page.getByRole("link", { name: "카카오페이로 보내기" })).toHaveCount(0);
  await page.getByRole("button", { name: "카카오뱅크 계좌번호 복사" }).click();
  await expect(page.getByText("계좌번호를 복사했어요. 은행 앱에서 이체해주세요.")).toBeVisible();
  const toss = page.getByRole("link", { name: "토스로 보내기" });
  await expect(toss).toHaveAttribute("href", "supertoss://");
  await toss.click();
  await expect(page.getByText("PC에서는 계좌번호를 복사해 드렸어요. 휴대폰 앱에서 보내주세요.")).toBeVisible();
  await expect(page.getByRole("link", { name: "토스 설치 안내" })).toBeVisible();
  await expect(page).toHaveURL(/\?key=ci-dummy-key/);
});

test("mobile tap retains native app navigation even when clipboard fails", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("denied"); } } });
    document.execCommand = () => false;
    // Observe React's decision, then suppress launching a real external payment app in CI.
    document.addEventListener("click", (e) => {
      const a = (e.target as Element).closest("a");
      if (a?.getAttribute("href") === "supertoss://") {
        document.documentElement.dataset.nativeAppNavigation = String(!e.defaultPrevented);
        e.preventDefault();
      }
    });
  });
  await page.goto("/?key=ci-dummy-key");
  await page.getByRole("button", { name: "마음 전하기 · 계좌 보기" }).click();
  await page.getByRole("button", { name: "카카오뱅크 계좌번호 복사" }).click();
  await expect(page.getByText("복사하지 못했어요. 위 계좌번호를 직접 입력해주세요.")).toBeVisible();
  await expect(page).toHaveURL(/\?key=ci-dummy-key/);
  await page.getByRole("link", { name: "토스로 보내기" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-native-app-navigation", "true");
  await expect(page.getByText("복사하지 못했어요. 위 계좌번호를 직접 입력해주세요.")).toBeVisible();
  await expect(page.getByRole("button", { name: "계좌 다시 복사" })).toBeVisible();
  await context.close();
});
