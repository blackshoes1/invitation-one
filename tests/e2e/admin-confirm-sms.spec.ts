import { test, expect } from "@playwright/test";

for (const notify of [true, false]) {
  test(`주문 확정 문자 ${notify ? "발송" : "생략"} 선택`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 760 });
    let status = "대기중";
    const patches: unknown[] = [];
    await page.route("**/api/admin/**", async route => {
      const path = new URL(route.request().url()).pathname;
      let json: object = {};
      if (path === "/api/admin/login") json = { ok: true };
      if (path === "/api/admin/groups") json = { groups: [], total_members: 0 };
      if (path === "/api/admin/invitees") json = { invitees: [] };
      if (path === "/api/admin/deliveries") json = { deliveries: [{
        id: "d1", date: "2026-10-15", time_slot: "저녁", location: "서울 용산구", status,
        group_id: null, participants: [{ id: "p1", name: "테스트하객", phone: "010-1111-2222", is_owner: true }],
      }] };
      if (path === "/api/admin/deliveries/d1") {
        patches.push(route.request().postDataJSON());status = "확정";
        json = { sms: notify ? { count: 1, sent: 1, skipped: false } : null };
      }
      await route.fulfill({ json });
    });
    await page.goto("/admin");
    await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
    await page.getByRole("button", { name: "주문", exact: true }).click();
    await expect(page.getByText("010-1111-2222")).toBeVisible();
    await page.getByRole("button", { name: "확정으로 변경", exact: true }).click();
    const choice = page.getByRole("group", { name: "주문 확정 문자 선택" });
    await expect(choice).toBeVisible();expect(patches).toEqual([]);
    await choice.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(choice).not.toBeVisible();expect(patches).toEqual([]);
    await page.getByRole("button", { name: "확정으로 변경", exact: true }).click();
    await choice.getByRole("button", { name: notify ? "문자 보내고 확정" : "문자 없이 확정", exact: true }).click();
    await expect.poll(() => patches).toEqual([{ status: "확정", notify }]);
    await expect(page.getByText(notify ? /참여자 1명에게 SMS 발송 완료/ : "확정 처리됐습니다. 안내 문자는 보내지 않았습니다.")).toBeVisible();
    await expect(page.getByRole("button", { name: "완료으로 변경", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
