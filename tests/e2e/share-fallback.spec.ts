import { test, expect, type Page } from "@playwright/test";
const KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "ci-dummy-key";

async function mockSharing(page: Page, mode: "desktop" | "blocked" | "mobile-error" | "mobile-cancel") {
  await page.addInitScript((mode) => {
    Object.defineProperty(navigator, "userAgent", { value: mode.startsWith("mobile") ? "iPhone" : "Windows Chrome", configurable: true });
    Reflect.set(window, "testCopied", []);
    Reflect.set(window, "testShareCalls", 0);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "blocked" ? undefined : {
      writeText: async (text: string) => { Reflect.get(window, "testCopied").push(text); },
    } });
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => {
      Reflect.set(window, "testShareCalls", Reflect.get(window, "testShareCalls") + 1);
      throw new DOMException("test", mode === "mobile-cancel" ? "AbortError" : "NotAllowedError");
    } });
  }, mode);
}

async function completeOrder(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-09T00:00:00Z"));
  await page.route("**/api/delivery/invite?*", (route) => route.fulfill({ json: {
    invite: { name: "공유테스트", phoneMasked: "010-****-5678", groupSlug: null },
  } }));
  await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/notify", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/delivery/create", (route) => route.fulfill({ json: { participant_id: "test", manage_token: "a".repeat(32) } }));
  await page.goto(`/delivery?i=${"b".repeat(32)}`);
  await page.getByRole("button", { name: /청첩장 받을 일정 정하기/ }).click();
  await page.getByRole("combobox", { name: "시/도" }).selectOption("서울");
  await page.getByRole("combobox", { name: "시/군/구" }).selectOption("강남구");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "14", exact: true }).click();
  await page.getByRole("button", { name: "🌙 저녁", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: /신랑 신랑이 갈게요/ }).click();
  await page.getByRole("button", { name: "주문 확인하기 🧾", exact: true }).click();
  await page.getByRole("button", { name: "네, 주문할게요 🛵", exact: true }).click();
  await expect(page.getByRole("button", { name: /단톡방에 공유/ })).toBeVisible();
}

for (const mode of ["desktop", "blocked", "mobile-error", "mobile-cancel"] as const) {
  test(`주문 완료 공유: ${mode}`, async ({ page }) => {
    await mockSharing(page, mode);
    await completeOrder(page);
    await page.getByRole("button", { name: /단톡방에 공유/ }).click();
    if (mode === "blocked") {
      const manual = page.getByRole("textbox", { name: "직접 복사할 공유 링크" });
      await expect(manual).toHaveValue(/\/delivery$/);
      await expect(page.getByText("링크를 복사했어요! 단톡방에 붙여넣어 주세요")).toHaveCount(0);
      await manual.click();
      expect(await manual.evaluate((element: HTMLInputElement) => element.selectionEnd! - element.selectionStart!)).toBeGreaterThan(10);
    } else {
      if (mode === "mobile-cancel") {
        await expect(page.getByRole("status")).toContainText("취소했어요");
        expect(await page.evaluate(() => Reflect.get(window, "testCopied"))).toEqual([]);
        await page.getByRole("button", { name: "공유 링크 복사", exact: true }).click();
      }
      await expect(page.getByRole("status")).toContainText("링크를 복사했어요");
      expect(await page.evaluate(() => Reflect.get(window, "testCopied"))).toEqual([new URL("/delivery", page.url()).href]);
    }
    expect(await page.evaluate(() => Reflect.get(window, "testShareCalls"))).toBe(mode.startsWith("mobile") ? 1 : 0);
  });
}

test("청첩장 공유도 PC에서 복사하고 실패하면 주소를 남긴다", async ({ page }) => {
  await mockSharing(page, "desktop");
  await page.goto(`/?key=${KEY}`);
  await page.getByRole("button", { name: "청첩장 공유하기", exact: true }).click();
  expect(await page.evaluate(() => Reflect.get(window, "testCopied"))).toEqual([new URL(`/?key=${KEY}`, page.url()).href]);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await page.getByRole("button", { name: "청첩장 링크 복사", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "직접 복사할 공유 링크" })).toHaveValue(new RegExp(`key=${KEY}`));
});
