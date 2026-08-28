import { test, expect } from "@playwright/test";

/**
 * E2E-4 Manage token 보안 (DB 불필요 부분)
 * - participant UUID(공개 식별자)는 관리 권한으로 쓸 수 없다 → 안내 화면
 * - 변조/임의 토큰으로 API 를 불러도 참여자 데이터가 나오지 않는다
 * 정상 토큰 성공 경로는 DB 시드가 필요해 db-flows.spec.ts (E2E_DB) 에서 다룬다.
 */

test("구 형식(participant UUID) 링크는 관리 화면 대신 안내 화면", async ({ page }) => {
  await page.goto("/delivery/manage/123e4567-e89b-42d3-a456-426614174000");
  await expect(page.getByText("관리 링크 방식이 바뀌었어요")).toBeVisible();
  // 신청 상세(참여자 관리 UI)가 아닌 안내 + 재발급 유도만 보인다
  await expect(page.getByRole("link", { name: /내 신청 찾기/ })).toBeVisible();
});

test("변조 토큰으로 관리 API 호출 시 참여자 데이터가 반환되지 않는다", async ({ request }) => {
  const res = await request.get(
    "/api/delivery/manage?t=deadbeefdeadbeefdeadbeefdeadbeef"
  );
  // DB 연결 시 401(invalid_token), 미설정 프로필에선 503(server_not_configured)
  expect([401, 503]).toContain(res.status());
  const body = await res.json();
  expect(body.participant).toBeUndefined();
  expect(body.error).toBeTruthy();
});

test("형식 불량 토큰(비 hex)도 동일하게 거부된다", async ({ request }) => {
  const res = await request.get("/api/delivery/manage?t=<script>alert(1)</script>");
  expect([401, 503]).toContain(res.status());
});
