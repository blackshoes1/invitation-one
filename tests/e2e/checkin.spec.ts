import { test, expect } from "@playwright/test";

/**
 * E2E 체크인 화면 (DB 불필요 부분)
 * 운영 시간 open/close 전환은 site_settings 시드가 필요해 db-flows(E2E_DB)에서.
 */

test("파라미터 없이 진입하면 QR 안내 화면", async ({ page }) => {
  await page.goto("/checkin");
  await expect(page.getByText("체크인은 QR 로 진행돼요.")).toBeVisible();
});

test("유효하지 않은 개인 QR 토큰이면 invalid 화면 (예약 정보 비노출)", async ({ page }) => {
  await page.goto("/checkin?t=123e4567-e89b-42d3-a456-426614174000");
  await expect(page.getByText("QR 을 확인하지 못했어요.")).toBeVisible();
  await expect(page.getByText("환영합니다")).toHaveCount(0);
});

test("체크인 페이지는 검색엔진 색인이 차단된다", async ({ page }) => {
  await page.goto("/checkin");
  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute("content", /noindex/);
});
