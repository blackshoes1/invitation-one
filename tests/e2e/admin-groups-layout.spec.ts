import { test, expect } from "@playwright/test";

for (const width of [320, 390, 1280]) {
  test(`group roster stays usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/admin/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let json: object = {};
      if (path === "/api/admin/login") json = { ok: true };
      if (path === "/api/admin/groups") json = { groups: [{ id: "g1", name: "화면 확인용 그룹", slug: "layout", roster_count: 1, member_count: 1 }], total_members: 1 };
      if (path === "/api/admin/groups/g1/members") json = { members: [{ id: "m1", name: "이름이긴테스트하객", phone: "010-1234-5678", attendance: "yes", attendance_shared: false, applied: true, personal: true, invited_at: "2026-09-08" }] };
      if (path === "/api/admin/deliveries") json = { deliveries: [] };
      if (path === "/api/admin/invitees") json = { invitees: [] };
      await route.fulfill({ json });
    });
    await page.goto("/admin");
    await page.getByRole("button", { name: "그룹", exact: true }).click();
    await page.getByRole("button", { name: "명단 ▼", exact: true }).click();
    const row = page.getByRole("listitem").filter({ hasText: "이름이긴테스트하객" });
    await expect(row).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("groups.png"), fullPage: true });
    const input = row.locator('input[type="tel"]');
    expect((await input.boundingBox())!.width).toBeGreaterThanOrEqual(140);
    expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const title = page.getByText("화면 확인용 그룹", { exact: false }).first();
    expect((await title.boundingBox())!.width).toBeGreaterThanOrEqual(140);
    const card = row.locator("..").locator("..").locator("..");
    expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
