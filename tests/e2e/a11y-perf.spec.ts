import { test, expect } from "@playwright/test";

/**
 * 청첩장 접근성·성능 회귀 방지 (4단계).
 *
 * 여기서 지키는 것은 "한 번 고쳐 놓으면 조용히 되돌아가기 쉬운" 것들이다:
 * 사진이 최적화를 우회해 원본으로 나가는 것, 자동으로 넘어가는 슬라이드를
 * 멈출 수 없게 되는 것, 모션 최소화 설정이 무시되는 것.
 */
const KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "ci-dummy-key";
const HOME = `/?key=${encodeURIComponent(KEY)}`;

test("페이지 제목 역할을 하는 h1 이 하나 있고 신랑신부 이름을 담는다", async ({
  page,
}) => {
  await page.goto(HOME);
  const h1 = page.locator("h1");
  await expect(h1).toHaveCount(1);
  // 이름은 wedding.ts 설정값이라 문자열을 고정하지 않고 "비어 있지 않은지" 만 본다
  await expect(h1).not.toBeEmpty();
});

test("사진은 원본이 아니라 이미지 최적화 경로로 요청된다", async ({ page }) => {
  const imageRequests: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "image") imageRequests.push(r.url());
  });

  await page.goto(HOME);
  await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();

  // 히어로는 LCP 요소 — 원본 jpg 를 그대로 받아오면 안 된다
  expect(imageRequests.some((u) => u.includes("/_next/image"))).toBe(true);
  expect(imageRequests.filter((u) => /\/pic\/.+\.(jpe?g|png)$/.test(u))).toEqual(
    []
  );
});

test("자동으로 넘어가는 갤러리를 멈출 수 있다", async ({ page }) => {
  await page.goto(HOME);

  const stop = page.getByRole("button", { name: "사진 자동 넘김 멈추기" });
  // 사진이 1장뿐이면 슬라이드 자체가 없다 — 그때는 검증할 대상이 없다
  if ((await stop.count()) === 0) test.skip();

  await page.locator("h2", { hasText: "우리의 순간" }).scrollIntoViewIfNeeded();
  const active = () =>
    page.locator('button[aria-current="true"]').first().getAttribute("aria-label");

  await stop.click();
  const before = await active();
  // 자동 넘김 주기(4.5초)보다 넉넉히 기다렸는데도 그대로여야 한다
  await page.waitForTimeout(5500);
  expect(await active()).toBe(before);

  // 다시 켜면 넘어간다
  await page.getByRole("button", { name: "사진 자동 넘김 다시 시작" }).click();
  await page.waitForTimeout(5500);
  expect(await active()).not.toBe(before);
});

// 모션 최소화는 컨텍스트를 직접 만들어 켠다.
// (test.use({ reducedMotion }) 는 이 Playwright 버전에서 실제 에뮬레이션까지
//  이어지지 않아 — matchMedia 가 false 로 나온다 — 테스트가 조용히 무력해진다)
test("동작 줄이기를 켜면 갤러리가 저절로 넘어가지 않는다", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  try {
    await page.goto(`${baseURL}${HOME}`);
    // 설정이 실제로 걸렸는지 먼저 확인 — 아니면 이 테스트는 아무것도 검증하지 못한다
    expect(
      await page.evaluate(
        () => matchMedia("(prefers-reduced-motion: reduce)").matches
      )
    ).toBe(true);

    const active = page.locator('button[aria-current="true"]').first();
    if ((await page.locator('button[aria-label$="번째 사진 보기"]').count()) === 0)
      return;

    await page.locator("h2", { hasText: "우리의 순간" }).scrollIntoViewIfNeeded();
    const before = await active.getAttribute("aria-label");
    await page.waitForTimeout(5500);
    expect(await active.getAttribute("aria-label")).toBe(before);

    // 애초에 자동으로 넘어가지 않으므로 멈춤 버튼도 필요 없다
    await expect(page.getByRole("button", { name: /자동 넘김/ })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("키보드로 이동하면 포커스 위치가 눈에 보인다", async ({ page }) => {
  // 배달 신청 화면은 입력창마다 focus:outline-none 을 쓰고 있어, 전역 포커스 링이
  // 이를 덮어쓰지 못하면 키보드 사용자가 현재 위치를 잃는다.
  await page.goto("/delivery");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");

  const outlineWidth = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    return getComputedStyle(el).outlineWidth;
  });
  expect(outlineWidth).not.toBeNull();
  expect(parseFloat(outlineWidth!)).toBeGreaterThan(0);
});
