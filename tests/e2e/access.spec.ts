import { test, expect } from "@playwright/test";
import { GUEST_GUIDE_START } from "../../src/lib/wedding";

/**
 * E2E-1 청첩장 접근 (invitation key 게이트)
 * NEXT_PUBLIC_INVITATION_KEY 는 빌드 타임 상수 — 빌드와 같은 값을 써야 한다.
 */
const KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "ci-dummy-key";
// page.tsx 와 같은 조건 — 미리보기 배포이거나 10월 15일 0시(KST) 이후면 하객 안내가 먼저 열린다
const GUIDE_ACTIVE = process.env.VERCEL_ENV === "preview" || Date.now() >= GUEST_GUIDE_START.getTime();

// 잠금 화면은 하객 안내 공개 전까지만 있다 — 공개일부터는 키 없이도 모두 열린다
test("키 없이 접근하면 기본 정보와 공개 축하 지도 영역이 보인다", async ({ page }) => {
  test.skip(GUIDE_ACTIVE, "하객 안내 공개 이후에는 잠금 화면이 없다");
  await page.goto("/");
  await expect(page.getByText("아직 공개 전이에요")).toBeVisible();
  // 본문(웨딩 사진 히어로)은 렌더되지 않는다
  await expect(page.getByAltText(/웨딩 사진/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "우리를 축하해준 사람들" })).toBeVisible();
  await expect(page.getByRole("button", { name: "💬 메시지", exact: true })).toHaveCount(0);
});

test("잘못된 키로 접근하면 잠금 화면이 보인다", async ({ page }) => {
  test.skip(GUIDE_ACTIVE, "하객 안내 공개 이후에는 잠금 화면이 없다");
  await page.goto("/?key=totally-wrong-key");
  await expect(page.getByText("아직 공개 전이에요")).toBeVisible();
});

test("정상 키로 접근하면 공개 일정에 맞는 청첩장이 열린다", async ({ page }) => {
  await page.goto(`/?key=${encodeURIComponent(KEY)}`);
  if (GUIDE_ACTIVE) {
    await expect(page.getByRole("link", { name: "축의금 계좌 안내", exact: true })).toBeVisible();
    await expect(page.getByAltText(/웨딩 사진/)).toHaveCount(0);
    await page.getByRole("link", { name: "모바일 청첩장 보러가기", exact: true }).click();
    await expect(page).toHaveURL(/view=photos/);
  }
  await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();
  await expect(page.getByText("아직 공개 전이에요")).toHaveCount(0);
});

test("한 번 열어본 기기는 키 없이 다시 들어와도 열린다", async ({ page }) => {
  await page.goto(`/?key=${encodeURIComponent(KEY)}`);
  await expect(page.getByRole("button", { name: "작은 글씨로 보기" })).toBeVisible();
  // 링크를 잃어버리고 주소만 다시 여는 상황
  await page.goto("/");
  await expect(page.getByText("아직 공개 전이에요")).toHaveCount(0);
  if (GUIDE_ACTIVE) {
    await expect(page.getByRole("link", { name: "축의금 계좌 안내", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "모바일 청첩장 보러가기", exact: true }).click();
    await expect(page).toHaveURL(/view=photos/);
  }
  await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();
});

test("잠금 화면에서 '내 신청 찾기'로 복구할 수 있다", async ({ page }) => {
  test.skip(GUIDE_ACTIVE, "하객 안내 공개 이후에는 잠금 화면이 없다");
  await page.goto("/");
  await page.getByRole("link", { name: /내 신청 찾기/ }).click();
  await expect(page).toHaveURL(/\/delivery\?find=1/);
  // 찾기 폼이 접힌 상태가 아니라 바로 열려 있어야 한다
  await expect(page.getByPlaceholder("연락처 끝 4자리")).toBeVisible();
});

test("공개 이후에는 키 없이 주소만 열어도 하객 안내와 사진 청첩장이 열린다", async ({ page, context }) => {
  test.skip(!GUIDE_ACTIVE, "미리보기 배포 또는 2026년 10월 15일 0시(KST) 이후 동작");
  for (const url of ["/", "/?key=totally-wrong-key"]) {
    await page.goto(url);
    await expect(page.getByText("아직 공개 전이에요")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "축의금 계좌 안내", exact: true })).toBeVisible();
    // 틀린 키는 링크에 실어 나르지 않는다
    const hrefs = await page.getByRole("link").evaluateAll(els => els.map(e => e.getAttribute("href") ?? ""));
    expect(hrefs.filter(h => h.includes("key="))).toEqual([]);
    await page.getByRole("link", { name: "모바일 청첩장 보러가기", exact: true }).click();
    await expect(page).toHaveURL(/view=photos/);
    await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();
    await expect(page.getByText("아직 공개 전이에요")).toHaveCount(0);
  }
  // 기억 쿠키는 유효한 키로 연 기기에만 남는다
  expect((await context.cookies()).map(c => c.name)).not.toContain("inv_key");
});
