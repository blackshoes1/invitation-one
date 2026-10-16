import { test, expect, type Page } from "@playwright/test";
import { GUEST_GUIDE_START } from "../../src/lib/wedding";

const KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "ci-dummy-key";
const HOME = `/?key=${encodeURIComponent(KEY)}&view=photos`;
const GUIDE = `/?key=${encodeURIComponent(KEY)}&via=qr`;
const GUIDE_ACTIVE = process.env.VERCEL_ENV === "preview" || Date.now() >= GUEST_GUIDE_START.getTime();

async function openEmptyGuestbook(page: Page, url = HOME) {
  // DB 설정 여부와 관계없이 빈 방명록을 검증하며 운영 데이터는 읽지 않는다.
  await page.route("**/rest/v1/rpc/get_celebrations", route => route.fulfill({ json: [] }));
  await page.route("**/api/admin/celebrations", route => route.fulfill({ status: 401, json: {} }));
  const [background, sprites] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === "/pic/village-bg.webp"),
    page.waitForResponse(response => new URL(response.url()).pathname === "/pic/village-sprites.webp"),
    page.goto(url),
  ]);
  expect(background.status()).toBe(200);
  expect(sprites.status()).toBe(200);
  await Promise.all([background.finished(), sprites.finished()]);
  const section = page.getByRole("region", { name: "우리를 축하해준 사람들" });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("button", { name: "🏘️ 마을", exact: true })).toHaveAttribute("aria-pressed", "true");
  const canvas = section.getByRole("img", { name: /^축하해 주신 0명의 도트 마을/ });
  await expect(canvas).toBeVisible();
  await expect(section.getByText("마을을 불러오지 못했어요", { exact: true })).toHaveCount(0);
  return { section, canvas };
}

async function openGuideVillage(page: Page, url = GUIDE) {
  const adminRequests: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/admin/celebrations") adminRequests.push(request.url());
  });
  await page.route("**/rest/v1/rpc/get_celebrations", route => route.fulfill({ json: [] }));
  const [background, sprites] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === "/pic/village-bg.webp"),
    page.waitForResponse(response => new URL(response.url()).pathname === "/pic/village-sprites.webp"),
    page.goto(url),
  ]);
  expect(background.status()).toBe(200);
  expect(sprites.status()).toBe(200);
  await Promise.all([background.finished(), sprites.finished()]);
  const section = page.locator("#guestbook");
  await section.scrollIntoViewIfNeeded();
  const canvas = section.getByRole("img", { name: /^축하해 주신 0명의 도트 마을/ });
  await expect(canvas).toBeVisible();
  await expect(section.getByText("CELEBRATION", { exact: true })).toHaveCount(0);
  await expect(section.getByRole("heading", { name: "도트 방명록", exact: true })).toHaveCount(0);
  expect(adminRequests).toEqual([]);
  return { section, canvas };
}

for (const width of [320, 390]) {
  test(`${width}px 큰 글씨에서 도트 마을이 기본으로 보이고 메시지로 전환할 수 있다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { section, canvas } = await openEmptyGuestbook(page);
    await expect(page.getByRole("button", { name: "작은 글씨로 보기" })).toHaveAttribute("aria-pressed", "true");
    const village = section.getByRole("button", { name: "🏘️ 마을", exact: true });
    const messages = section.getByRole("button", { name: "💬 메시지", exact: true });
    await expect(village).toHaveAttribute("aria-pressed", "true");
    await expect(messages).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await messages.click();
    await expect(messages).toHaveAttribute("aria-pressed", "true");
    await expect(village).toHaveAttribute("aria-pressed", "false");
    await expect(canvas).toHaveCount(0);
    await expect(section.getByText("첫 손님을 기다리고 있어요 🛵", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await village.click();
    await expect(canvas).toBeVisible();
    await expect(village).toHaveAttribute("aria-pressed", "true");
  });
}

test("동작 줄이기에서도 신랑을 두 번 누르면 사진 갤러리로 이동한다", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    const { canvas } = await openEmptyGuestbook(page, `${baseURL}${HOME}`);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
    await canvas.scrollIntoViewIfNeeded();
    const gallery = page.locator("#gallery");
    await expect(gallery).not.toBeInViewport();
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    // 논리 세계 384×457에서 신랑(162, 발 222)의 몸통을 누른다.
    const position = { x: bounds!.width * 162 / 384, y: bounds!.height * 190 / 457 };
    await canvas.click({ position });
    await expect(gallery).not.toBeInViewport();
    await canvas.click({ position });
    await expect(gallery).toBeInViewport();
    await expect.poll(() => gallery.evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThan(2);
  } finally {
    await context.close();
  }
});

test.describe("첫 안내의 도트 방명록", () => {
  test.skip(!GUIDE_ACTIVE, "하객 안내 공개 이후 동작 검증");

  for (const width of [320, 390]) {
    test(`${width}px 큰 글씨에서 안내 맨 아래의 마을 밑에 축하 작성 버튼이 보인다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const { section } = await openGuideVillage(page);
      await expect(page.getByRole("button", { name: "작은 글씨로 보기" })).toHaveAttribute("aria-pressed", "true");
      await expect(section.getByRole("form")).toHaveCount(0);
      await expect(section.getByRole("group", { name: "방명록 보기 방식" })).toHaveCount(0);
      await expect(page.locator("main section").last()).toHaveAttribute("id", "guestbook");
      const villageBounds = await section.boundingBox();
      const linkBounds = await page.getByRole("link", { name: "모바일 청첩장 보러가기", exact: true }).boundingBox();
      expect(villageBounds).not.toBeNull();
      expect(linkBounds).not.toBeNull();
      expect(villageBounds!.y).toBeGreaterThanOrEqual(linkBounds!.y + linkBounds!.height);
      const writeLink = page.getByRole("link", { name: "축하메시지 남기러 가기", exact: true });
      await expect(writeLink).toBeVisible();
      const writeBounds = await writeLink.boundingBox();
      expect(writeBounds).not.toBeNull();
      expect(writeBounds!.y).toBeGreaterThanOrEqual(villageBounds!.y + villageBounds!.height);
      expect(writeBounds!.height).toBeGreaterThanOrEqual(48);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  for (const entry of [
    { name: "QR 링크", path: GUIDE, key: KEY, via: "qr" },
    { name: "주소 직접 입력", path: "/", key: null, via: null },
    { name: "잘못된 접근 키", path: "/?key=wrong-key&via=qr", key: null, via: "qr" },
  ]) {
    test(`${entry.name}에서 축하 작성 버튼으로 폼에 바로 도착하고 메시지를 남긴다`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 844 });
      await openGuideVillage(page, entry.path);
      let submissions = 0;
      await page.route("**/api/celebrations", route => {
        submissions++;
        expect(route.request().postDataJSON()).toMatchObject({
          name: "축하 하객", message: "두 분의 결혼을 축하해요!", visibility: "anon",
        });
        return route.fulfill({ json: { ok: true } });
      });
      await page.getByRole("link", { name: "축하메시지 남기러 가기", exact: true }).click();
      await expect(page).toHaveURL(/view=photos#celebration-form$/);
      const url = new URL(page.url());
      expect(url.searchParams.get("key")).toBe(entry.key);
      expect(url.searchParams.get("via")).toBe(entry.via);
      const form = page.getByRole("form", { name: "축하 한마디 남기기" });
      await expect(form.getByRole("textbox", { name: "이름", exact: true })).toBeInViewport();
      await expect(form.getByRole("textbox", { name: "축하 한마디", exact: true })).toBeInViewport();
      await form.getByRole("textbox", { name: "이름", exact: true }).fill("축하 하객");
      await form.getByRole("textbox", { name: "축하 한마디", exact: true }).fill("두 분의 결혼을 축하해요!");
      await form.getByRole("button", { name: "축하 남기기", exact: true }).click();
      await expect(form.getByRole("status")).toContainText("축하 한마디를 남겼어요");
      expect(submissions).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  }

  test("안내의 신랑을 두 번 누르면 접근 키와 QR 경로를 유지하며 사진으로 이동한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const { canvas } = await openGuideVillage(page);
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    const position = { x: bounds!.width * 162 / 384, y: bounds!.height * 190 / 457 };
    await canvas.click({ position });
    expect(new URL(page.url()).searchParams.get("view")).toBeNull();
    await canvas.click({ position });
    await expect(page).toHaveURL(/view=photos.*#gallery$/);
    const url = new URL(page.url());
    expect(url.searchParams.get("key")).toBe(KEY);
    expect(url.searchParams.get("via")).toBe("qr");
    expect(url.hash).toBe("#gallery");
    await expect(page.locator("#gallery")).toBeInViewport();
  });
});
