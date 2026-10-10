import { test, expect } from "@playwright/test";
import { accounts, GUEST_GUIDE_START, parkingLot, venue } from "../../src/lib/wedding";

const KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "ci-dummy-key";
const HOME = `/?key=${encodeURIComponent(KEY)}&via=qr`;

test("공개 전에는 안내 URL로 들어가도 기존 청첩장이 바로 열린다", async ({ page }) => {
  test.skip(Date.now() >= GUEST_GUIDE_START.getTime(), "하객 안내 공개 전 동작 검증");
  for (const view of ["", "accounts", "route"]) {
    await page.goto(`${HOME}&view=${view}`);
    await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();
    await expect(page.getByRole("link", { name: "계좌 확인하기" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "하객 안내로 돌아가기" })).toHaveCount(0);
  }
});

test.describe("하객 안내 공개 이후", () => {
  test.skip(Date.now() < GUEST_GUIDE_START.getTime(), "2026년 10월 15일 0시(KST) 이후 공개되는 화면");

  test("첫 안내에서 필수 정보를 보여주고 사진은 열기 전까지 받지 않는다", async ({ page }) => {
    const photoRequests: string[] = [];
    page.on("request", request => {
      if (request.url().includes("/_next/image") || request.url().includes("/pic/")) photoRequests.push(request.url());
    });
    await page.goto(HOME);
    await expect(page.getByRole("heading", { name: "축의대는 운영하지 않습니다." })).toBeVisible();
    await expect(page.getByText(/축의금은 아래 계좌로/)).toBeVisible();
    await expect(page.getByRole("link", { name: "주차장 → 예식장 길 안내" })).toBeVisible();
    await expect(page.getByAltText(/웨딩 사진/)).toHaveCount(0);
    expect(photoRequests).toEqual([]);
    await page.getByRole("link", { name: "사진 보기", exact: true }).click();
    await expect(page).toHaveURL(/view=photos/);
    expect(new URL(page.url()).searchParams.get("key")).toBe(KEY);
    expect(new URL(page.url()).searchParams.get("via")).toBe("qr");
    await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();
    await page.getByRole("link", { name: "하객 안내로 돌아가기" }).click();
    await expect(page.getByRole("link", { name: "계좌 확인하기" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("via")).toBe("qr");
  });

  test("계좌 안내를 열면 실제 계좌가 펼쳐져 있고 번호를 복사할 수 있다", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        writeText: async (text: string) => { Reflect.set(window, "copiedAccount", text); },
      } });
    });
    await page.goto(HOME);
    await page.getByRole("link", { name: "계좌 확인하기" }).click();
    await expect(page.getByText(accounts[0].number, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: `${accounts[0].name} 계좌번호 복사` }).click();
    await expect(page.getByRole("status").filter({ hasText: "계좌번호를 복사했어요" })).toBeVisible();
    expect(await page.evaluate(() => Reflect.get(window, "copiedAccount"))).toBe(accounts[0].number);
    await page.goBack();
    await expect(page.getByRole("link", { name: "계좌 확인하기" })).toBeVisible();
  });

  test("주차장과 예식장 위치 및 실제 도보 길찾기로 안내한다", async ({ page }) => {
    await page.goto(HOME);
    await page.getByRole("link", { name: "주차장 → 예식장 길 안내" }).click();
    await expect(page.getByRole("heading", { name: parkingLot.name, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: `${venue.name} 야외예식장`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "주차장 위치 보기" })).toHaveAttribute("href", parkingLot.nav.naverWeb);
    await expect(page.getByRole("link", { name: "네이버 도보 길찾기" })).toHaveAttribute("href", parkingLot.walkNav.naverWeb);
    await expect(page.getByRole("link", { name: "카카오맵 길찾기" })).toHaveAttribute("href", parkingLot.walkNav.kakaoWeb);
  });

  for (const width of [320, 390]) {
    test(`${width}px 큰 글씨에서도 안내와 세부 화면이 가로로 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      for (const view of ["", "accounts", "route"]) {
        await page.goto(`${HOME}&view=${view}`);
        await expect(page.getByRole("button", { name: "작은 글씨로 보기" })).toHaveAttribute("aria-pressed", "true");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    });
  }

});

for (const view of ["accounts", "route", "photos"]) {
  test(`접근 키 없이 ${view} 화면으로 직접 들어가도 잠금이 유지된다`, async ({ page }) => {
    await page.goto(`/?view=${view}`);
    await expect(page.getByText("아직 공개 전이에요")).toBeVisible();
    await expect(page.getByText(accounts[0].number, { exact: true })).toHaveCount(0);
    await expect(page.getByAltText(/웨딩 사진/)).toHaveCount(0);
  });
}
