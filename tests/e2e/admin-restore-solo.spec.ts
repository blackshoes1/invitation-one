import { test, expect } from "@playwright/test";

test("cancelled order can be edited without SMS, then restored", async ({ page }) => {
  const patches: Record<string, unknown>[] = [];
  let status = "취소";
  await page.route("**/api/admin/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON(); patches.push(body);
      if (body.action === "restore") status = "대기중";
      return route.fulfill({ json: { restored: true, sms: null } });
    }
    return route.fulfill({ json: path === "/api/admin/login" ? { ok: true }
      : path === "/api/admin/groups" ? { groups: [], total_members: 0 }
      : path === "/api/admin/deliveries" ? { deliveries: [{
        id: "d1", date: "2026-09-28", time_slot: "저녁", status, location: "서울 강남구", hidden: false,
        group_id: null, tracking_stage: "주문접수", participants: [{ id: "p1", name: "복구하객", is_owner: true }],
      }] } : {} });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "주문", exact: true }).click();
  await page.getByRole("button", { name: "📝 일정·장소 수정" }).click();
  await expect(page.getByText(/취소 상태를 유지하며 저장합니다/)).toBeVisible();
  await page.getByRole("textbox", { name: "상세 위치" }).fill("역 1번 출구");
  await page.getByRole("button", { name: "변경 저장" }).click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toMatchObject({ notify: false, location: "서울 강남구 역 1번 출구" });
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "대기중으로 복구" }).click();
  await expect(page.getByRole("button", { name: "확정으로 변경 (SMS)" })).toBeVisible();
  expect(patches[1]).toEqual({ action: "restore" });
});

test("solo invite creates a personal order from the selected roster entry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let submitted: Record<string, unknown> | null = null;
  const member = { id: "10000000-0000-0000-0000-000000000001", name: "개별하객", phone: null, applied: false };
  await page.route("**/api/admin/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/deliveries" && route.request().method() === "POST") {
      submitted = route.request().postDataJSON(); member.applied = true;
      return route.fulfill({ json: { delivery_id: "d" } });
    }
    return route.fulfill({ json: path === "/api/admin/login" ? { ok: true }
      : path === "/api/admin/groups" ? { groups: [], total_members: 0 }
      : path === "/api/admin/invitees" ? { members: [member] }
      : path === "/api/admin/deliveries" ? { deliveries: [] } : {} });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "그룹", exact: true }).click();
  await page.getByRole("button", { name: /개별 초대/ }).click();
  await page.getByRole("button", { name: "개별하객 주문 생성" }).click();
  await page.getByLabel("배송 날짜", { exact: true }).fill("2026-09-28");
  await page.getByRole("combobox", { name: "배송 시간" }).selectOption("저녁");
  await page.getByRole("combobox", { name: "배송지 시/도" }).selectOption("서울");
  await page.getByRole("combobox", { name: "배송지 시/군/구" }).selectOption("강남구");
  await page.getByRole("button", { name: "개인 주문 생성", exact: true }).click();
  await expect(page.getByRole("button", { name: "개별하객 주문 생성" })).toBeDisabled();
  expect(submitted).toMatchObject({ member_id: member.id, location: "서울 강남구", date: "2026-09-28", time_slot: "저녁" });
  expect(submitted).not.toHaveProperty("group_id");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
