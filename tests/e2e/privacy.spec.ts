import { test, expect } from "@playwright/test";

for (const width of [320, 390, 1280]) {
  test(`privacy management is readable and cannot purge early at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    let changes = 0;
    await page.route("**/api/admin/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() !== "GET") changes++;
      let json: object = {};
      if (path === "/api/admin/login") json = { ok: true };
      if (path === "/api/admin/groups") json = { groups: [], total_members: 0 };
      if (path === "/api/admin/deliveries") json = { deliveries: [] };
      if (path === "/api/admin/privacy") json = { state: {
        eligible: false, purged_at: null, receipt: null, fingerprint: "a".repeat(64),
        counts: { group_members: 68, participants: 10, guest_photos_preserved: 12, memories_preserved: 5 },
        external_checks: { local_copies: false, provider_backups: false, sms: false, admin_messages: false },
      }, logs: [{ id: "l1", created_at: "2026-10-14T00:00:00Z", action: "read_request", outcome: "allowed", resource: "/api/admin/groups", actor_hash: "b".repeat(64) }] };
      await route.fulfill({ json });
    });
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "캘린더", exact: true })).toBeVisible();
    if (width < 1024) await page.getByRole("button", { name: "메뉴 열기" }).click();
    await page.getByRole("button", { name: "개인정보", exact: true }).click();
    await expect(page.getByRole("heading", { name: "보관 및 파기" })).toBeVisible();
    await expect(page.getByText("2026년 11월 17일 오전 11시", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "확인한 개인정보 파기" })).toBeDisabled();
    await expect(page.getByLabel("관리자 비밀번호 재확인")).toBeDisabled();
    await expect(page.getByText("조회 요청 · 요청 허용", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(changes).toBe(0); expect(errors).toEqual([]);
    await page.screenshot({ path: test.info().outputPath("privacy.png"), fullPage: true });
  });
}

test("common checkin requires SMS before revealing a reservation", async ({ page }) => {
  let searches = 0;
  const ticket = "a".repeat(32);
  await page.route("**/api/identity/request", route => route.fulfill({ json: { challengeId: "10000000-0000-4000-8000-000000000001" } }));
  await page.route("**/api/identity/verify", route => route.fulfill({ json: { verified: true, purpose: "checkin", verificationToken: ticket, result: null } }));
  await page.route("**/api/checkin/search", async route => {
    searches++; expect(route.request().postDataJSON().verificationToken).toBe(ticket);
    await route.fulfill({ json: { candidates: [{ rsvpId: "r1", displayName: "인증하객", expectedPartySize: 2 }] } });
  });
  await page.goto("/checkin?event=ui-test-event");
  await page.getByLabel("성함", { exact: true }).fill("인증하객");
  await page.getByLabel("전체 전화번호").fill("01011112222");
  expect(searches).toBe(0); await expect(page.getByText("예약 확인", { exact: false })).toHaveCount(0);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "인증 문자 받기" }).click();
  await page.getByLabel("문자 인증번호").fill("123456");
  await page.getByRole("button", { name: "인증번호 확인" }).click();
  await expect(page.getByText("인증하객님, 환영합니다")).toBeVisible();
  await expect(page.getByRole("button", { name: "2명 체크인하기" })).toBeVisible();
  expect(searches).toBe(1);
});

test("public notice explains preserved photos and messages", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "개인정보 처리 안내" })).toBeVisible();
  await expect(page.getByText("사진·축하 글은 기념용으로 보존합니다.", { exact: false })).toBeVisible();
  await expect(page.getByText("솔라피", { exact: false })).toBeVisible();
});
