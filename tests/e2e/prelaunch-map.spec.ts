import { test, expect, type Page } from "@playwright/test";

// Use only the existing public RPC shape; no admin names or production writes.
const celebrations = [
  { id: "public-heart", kind: "마음배송", name: "수줍은 토끼", area: "부산", date: null,
    stamp: "💌", message: "지도에는 메시지 본문을 표시하지 않아요", rating: null, review: null,
    reply: null, replied_at: null, created_at: "2026-09-09T00:00:00Z" },
  { id: "public-delivery", kind: "직접배달", name: "테스트하객", area: "서울 용산구", date: "2026-09-09",
    stamp: null, message: null, rating: null, review: null,
    reply: null, replied_at: null, created_at: "2026-09-09T00:00:00Z" },
];

async function mockPublicMap(page: Page) {
  const adminReads: string[] = [];
  await page.route("**/api/admin/celebrations", route => {
    adminReads.push(route.request().url());
    return route.fulfill({ json: { realNames: { "public-heart": { name: "관리자전용실명", masked: true } } } });
  });
  await page.route("**/rest/v1/rpc/get_celebrations", route => route.fulfill({ json: celebrations }));
  return adminReads;
}

test.describe("공개 전 축하 지도", () => {
  test.skip(process.env.E2E_DB !== "1", "Requires a configured-client build; public RPC responses are mocked.");

  for (const width of [320, 390, 1280]) {
    test(`${width}px에서 지도와 공개 버블을 바로 보고 필터링할 수 있다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const adminReads = await mockPublicMap(page);
      await page.goto("/");
      const section = page.getByRole("region", { name: "우리를 축하해준 사람들" });
      await section.scrollIntoViewIfNeeded();
      await expect(section.getByText(/지금까지 2명이/)).toBeVisible();
      await expect(section.locator("svg").first()).toBeVisible();
      await expect(section.getByRole("button", { name: "💬 메시지", exact: true })).toHaveCount(0);
      // 시/도 단위 버블 — 부산(마음 1) · 서울(직접 1, "서울 용산구" 는 서울 버블로 합쳐짐)
      const busan = section.getByRole("button", { name: "부산 1명, 마음 1명" });
      const seoul = section.getByRole("button", { name: "서울 1명, 직접 1명" });
      const directCard = section.getByRole("button", { name: /직접 만난 분/ });
      const heartCard = section.getByRole("button", { name: /마음 보낸 분/ });
      await expect(section.getByRole("button", { name: /^(서울|부산|경기) \d+명/ })).toHaveCount(2);
      await expect(directCard).toContainText("1명");
      await expect(heartCard).toContainText("1명");
      await expect(directCard).toHaveAttribute("aria-pressed", "false");
      await expect(heartCard).toHaveAttribute("aria-pressed", "false");

      // 버블을 누르면 이름이 보이고, 다시 누르면 닫힌다 (실명·메시지 본문은 어디에도 없다)
      await busan.click();
      await expect(section.getByText("💌 수줍은 토끼님", { exact: true })).toBeVisible();
      await expect(section.getByText("부산 · 💌 마음 1명", { exact: true })).toBeVisible();
      await expect(page.getByText("관리자전용실명", { exact: false })).toHaveCount(0);
      await expect(page.getByText(celebrations[0].message!, { exact: true })).toHaveCount(0);
      await busan.click();
      await expect(section.getByText("💌 수줍은 토끼님", { exact: true })).toHaveCount(0);

      // 마음 보낸 분만 — 서울(직접) 버블이 사라지고 부산만 남는다. 열려 있던 말풍선은 닫힌다
      await busan.click();
      await heartCard.click();
      await expect(heartCard).toHaveAttribute("aria-pressed", "true");
      await expect(directCard).toHaveAttribute("aria-pressed", "false");
      await expect(seoul).toHaveCount(0);
      await expect(busan).toHaveCount(1);
      await expect(section.getByText("💌 수줍은 토끼님", { exact: true })).toHaveCount(0);
      await heartCard.click();
      await expect(heartCard).toHaveAttribute("aria-pressed", "false");
      await expect(seoul).toHaveCount(1);
      await expect(busan).toHaveCount(1);

      // 직접 만난 분만 — 부산(마음) 버블이 사라지고 서울만 남는다. 카드 수치는 필터와 무관
      await directCard.click();
      await expect(directCard).toHaveAttribute("aria-pressed", "true");
      await expect(busan).toHaveCount(0);
      await expect(section.getByRole("button", { name: "서울 1명, 직접 1명" })).toHaveCount(1);
      await expect(heartCard).toContainText("1명");
      await directCard.click();
      await expect(directCard).toHaveAttribute("aria-pressed", "false");
      await expect(busan).toHaveCount(1);
      await expect(page.getByAltText(/웨딩 사진/)).toHaveCount(0);
      await expect(page.getByRole("link", { name: /청첩장 받으러 가기/ })).toHaveAttribute("href", "/delivery");
      expect(adminReads).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath(`prelaunch-map-${width}.png`), fullPage: true });
    });
  }

  test("빈 데이터는 안내하고 조회 실패는 빈 축하 목록으로 오해시키지 않는다", async ({ page }) => {
    await page.clock.install();
    const adminReads = await mockPublicMap(page);
    let failing = true;
    await page.route("**/rest/v1/rpc/get_celebrations", route => failing
      ? route.fulfill({ status: 503, json: { message: "temporarily unavailable" } })
      : route.fulfill({ json: [] }));
    await page.goto("/?key=wrong-key");
    const section = page.getByRole("region", { name: "우리를 축하해준 사람들" });
    await expect(section.getByRole("status")).toContainText("잠시 불러오지 못했어요");
    await expect(section.getByText(/첫 손님을 기다리고/)).toHaveCount(0);
    failing = false;
    await page.clock.fastForward(26_000);
    await expect(section.getByText(/첫 손님을 기다리고/)).toBeVisible();
    await expect(section.getByRole("status")).toHaveCount(0);
    await expect(page.getByText("아직 공개 전이에요", { exact: false })).toBeVisible();
    expect(adminReads).toEqual([]);
  });
});
