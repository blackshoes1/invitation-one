import { test, expect } from "@playwright/test";
import { accounts, bride, formatFullDate, formatTime, groom, GUEST_GUIDE_START, parkingLot, venue } from "../../src/lib/wedding";

const KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "ci-dummy-key";
const HOME = `/?key=${encodeURIComponent(KEY)}&via=qr`;
const GUIDE_ACTIVE = process.env.VERCEL_ENV === "preview" || Date.now() >= GUEST_GUIDE_START.getTime();

test("공개 전에는 안내 URL로 들어가도 기존 청첩장이 바로 열린다", async ({ page }) => {
  test.skip(GUIDE_ACTIVE, "하객 안내 공개 전 동작 검증");
  for (const view of ["", "accounts", "route", "guest-snap"]) {
    await page.goto(`${HOME}&view=${view}`);
    await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();
    await expect(page.getByRole("link", { name: "축의금 계좌 안내" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "하객 안내로 돌아가기" })).toHaveCount(0);
  }
});

test.describe("하객 안내 공개 이후", () => {
  test.skip(!GUIDE_ACTIVE, "미리보기 배포 또는 2026년 10월 15일 0시(KST) 이후 공개되는 화면");

  test("첫 안내에서 필수 정보를 보여주고 사진은 열기 전까지 받지 않는다", async ({ page }) => {
    const photoRequests: string[] = [];
    page.on("request", request => {
      const path = new URL(request.url()).pathname;
      const villageAsset = path === "/pic/village-bg.webp" || path === "/pic/village-sprites.webp";
      if (path === "/_next/image" || (path.startsWith("/pic/") && !villageAsset)) photoRequests.push(request.url());
    });
    await page.goto(HOME);
    await expect(page.locator("header").getByText(`${groom.name} · ${bride.name}`, { exact: true })).toBeVisible();
    await expect(page.locator("header").getByText(`${venue.name} 야외예식장`, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "축의금 계좌 안내" })).toBeVisible();
    await expect(page.getByText("현장 축의대는 운영하지 않습니다.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "예식장 오시는 길" })).toBeVisible();
    await expect(page.getByAltText(/웨딩 사진/)).toHaveCount(0);
    expect(photoRequests).toEqual([]);
    await page.getByRole("link", { name: "모바일 청첩장 보러가기", exact: true }).click();
    await expect(page).toHaveURL(/view=photos/);
    expect(new URL(page.url()).searchParams.get("key")).toBe(KEY);
    expect(new URL(page.url()).searchParams.get("via")).toBe("qr");
    await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();
    await page.getByRole("link", { name: "하객 안내로 돌아가기" }).click();
    await expect(page.getByRole("link", { name: "축의금 계좌 안내" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("via")).toBe("qr");
  });

  test("베스트샷 카드는 청첩장의 하객 사진 업로드로 바로 이동한다", async ({ page }) => {
    await page.goto(HOME);
    await page.getByRole("link", { name: "오늘의 베스트샷을 찾습니다!", exact: true }).click();
    await expect(page).toHaveURL(/view=guest-snap$/);
    expect(new URL(page.url()).searchParams.get("key")).toBe(KEY);
    expect(new URL(page.url()).searchParams.get("via")).toBe("qr");
    await expect(page.locator("#guest-snap").getByRole("heading", { name: "하객 스냅" })).toBeInViewport();
    await expect(page.locator("#guest-snap").getByText("첫 업로드와 베스트샷에 선물을 드려요.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "앨범에서 고르기" })).toBeVisible();
    await expect(page.getByAltText(/웨딩 사진/)).toHaveCount(0);
    await page.getByRole("link", { name: "하객 안내로", exact: true }).click();
    await expect(page.getByRole("link", { name: "오늘의 베스트샷을 찾습니다!", exact: true })).toBeVisible();
  });

  test("계좌 안내를 열면 실제 계좌가 펼쳐져 있고 번호를 복사할 수 있다", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: async (text: string) => { Reflect.set(window, "copiedAccount", text); },
      } });
    });
    await page.goto(HOME);
    await page.getByRole("link", { name: "축의금 계좌 안내" }).click();
    await expect(page.getByText(accounts[0].number, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `${accounts[0].name} 계좌번호 복사` }).click();
    await expect(page.getByRole("status").filter({ hasText: "계좌번호를 복사했어요" })).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, "copiedAccount"))).toBe(accounts[0].number);
    await page.goBack();
    await expect(page.getByRole("link", { name: "축의금 계좌 안내" })).toBeVisible();
  });

  test("주차장과 예식장 위치 및 실제 도보 길찾기로 안내한다", async ({ page }) => {
    await page.goto(HOME);
    await page.getByRole("link", { name: "예식장 오시는 길" }).click();
    await expect(page.getByRole("heading", { name: parkingLot.name, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: `${venue.name} 야외예식장`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "주차장 위치 보기" })).toHaveAttribute("href", parkingLot.nav.naverWeb);
    await expect(page.getByRole("link", { name: "카카오맵 예식장 위치 보기" })).toHaveAttribute("href", venue.nav.kakaoWeb);
    await expect(page.getByRole("link", { name: "네이버 지도 예식장 위치 보기" })).toHaveAttribute("href", venue.nav.naverWeb);
    await expect(page.getByRole("link", { name: "신랑에게 전화하기", exact: true })).toHaveAttribute("href", `tel:${groom.phone?.replaceAll("-", "")}`);
    await expect(page.getByRole("link", { name: /예식장 문의/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "네이버 도보 길찾기" })).toHaveAttribute("href", parkingLot.walkNav.naverWeb);
    await expect(page.getByRole("link", { name: "카카오맵 길찾기" })).toHaveAttribute("href", parkingLot.walkNav.kakaoWeb);
  });

  test("큰 글씨를 전환하면 날짜와 카드 설명도 확대되고 선택이 유지된다", async ({ page }) => {
    await page.goto(HOME);
    const date = page.locator("header").getByText(`${formatFullDate()} · ${formatTime()}`, { exact: true });
    const description = page.getByText("현장 축의대는 운영하지 않습니다.", { exact: true });
    const largeDate = await date.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    const largeDescription = await description.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    await page.getByRole("button", { name: "작은 글씨로 보기" }).click();
    expect(await date.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThan(largeDate);
    expect(await description.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThan(largeDescription);
    await page.reload();
    await expect(page.getByRole("button", { name: "큰 글씨로 보기" })).toHaveAttribute("aria-pressed", "false");
  });

  for (const width of [320, 390]) {
    test(`${width}px 큰 글씨에서도 안내와 세부 화면이 가로로 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      for (const view of ["", "accounts", "route", "guest-snap"]) {
        await page.goto(`${HOME}&view=${view}`);
        await expect(page.getByRole("button", { name: "작은 글씨로 보기" })).toHaveAttribute("aria-pressed", "true");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    });
  }

});

// 하객 안내 공개일부터는 키 없이도 안내와 사진 청첩장이 모두 열린다. 그 전에는 키가 있어야 한다.
for (const view of ["accounts", "route", "guest-snap", "photos"]) {
  test(`접근 키 없이 ${view} 화면: 공개 전엔 잠금, 이후엔 열린다`, async ({ page }) => {
    await page.goto(`/?view=${view}`);
    if (!GUIDE_ACTIVE) {
      await expect(page.getByText("아직 공개 전이에요")).toBeVisible();
      await expect(page.getByText(accounts[0].number, { exact: true })).toHaveCount(0);
      await expect(page.getByAltText(/웨딩 사진/)).toHaveCount(0);
      return;
    }
    await expect(page.getByText("아직 공개 전이에요")).toHaveCount(0);
    if (view === "accounts") await expect(page.getByText(accounts[0].number, { exact: true })).toBeVisible();
    if (view === "route") await expect(page.getByRole("heading", { name: `${venue.name} 야외예식장`, exact: true })).toBeVisible();
    if (view === "guest-snap") await expect(page.getByRole("button", { name: "앨범에서 고르기" })).toBeVisible();
    if (view === "photos") await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();
  });
}
