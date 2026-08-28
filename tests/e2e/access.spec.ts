import { test, expect } from "@playwright/test";

/**
 * E2E-1 청첩장 접근 (invitation key 게이트)
 * NEXT_PUBLIC_INVITATION_KEY 는 빌드 타임 상수 — 빌드와 같은 값을 써야 한다.
 */
const KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "ci-dummy-key";

test("키 없이 접근하면 잠금 화면(기본 정보만)이 보인다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("아직 공개 전이에요")).toBeVisible();
  // 본문(웨딩 사진 히어로)은 렌더되지 않는다
  await expect(page.getByAltText(/웨딩 사진/)).toHaveCount(0);
});

test("잘못된 키로 접근하면 잠금 화면이 보인다", async ({ page }) => {
  await page.goto("/?key=totally-wrong-key");
  await expect(page.getByText("아직 공개 전이에요")).toBeVisible();
});

test("정상 키로 접근하면 청첩장 본문이 렌더된다", async ({ page }) => {
  await page.goto(`/?key=${encodeURIComponent(KEY)}`);
  // 히어로(웨딩 사진)가 보이고 잠금 화면은 없다
  await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();
  await expect(page.getByText("아직 공개 전이에요")).toHaveCount(0);
});
