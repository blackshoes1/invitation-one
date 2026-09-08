import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("personal invitation opens optional private group space and persists consent changes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const space = {
    groupName: "테스트 모임", rosterCount: 2, sharedAttendingCount: 0,
    me: { name: "테스트하객", attendance: null as string | null, shareWithGroup: false },
    members: [{ name: "다＊＊", attendance: null, shared: false }],
    schedules: [{ date: "2026-09-12", time_slot: "저녁" }],
  };
  await page.route("**/api/delivery/invite?*", (route) => route.fulfill({ json: {
    invite: { name: "테스트하객", phoneMasked: null, groupSlug: "test", groupName: "테스트 모임" },
  } }));
  await page.route("**/api/delivery/group-space", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.token).toBe("a".repeat(32));
    if (body.action === "save") {
      space.me.attendance = body.attendance;
      space.me.shareWithGroup = body.shareWithGroup;
      space.sharedAttendingCount = body.attendance === "yes" && body.shareWithGroup ? 1 : 0;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ json: { space } });
  });
  await page.goto(`/delivery?i=${"a".repeat(32)}`);
  const card = page.getByRole("region", { name: "우리 모임" });
  await expect(card.getByRole("link", { name: "모바일 청첩장 보기" })).toBeVisible();
  await expect(card.getByRole("radio", { name: "참석할게요", exact: true })).toHaveCount(0);
  await card.getByRole("button", { name: "우리 모임 보기" }).click();
  await expect(card.getByText("테스트 모임 · 초대받은 분 2명")).toBeVisible();
  await expect(card.getByRole("checkbox")).not.toBeChecked();
  await card.getByRole("radio", { name: "참석할게요", exact: true }).check();
  await card.getByRole("checkbox").check();
  await card.getByRole("button", { name: "응답 저장" }).click();
  await expect(card.getByRole("status")).toContainText("저장했어요");
  await expect(card.getByText(/공유한 참석 예정자 1명/)).toBeVisible();
  await card.getByRole("checkbox").uncheck();
  await card.getByRole("button", { name: "응답 저장" }).click();
  await expect(card.getByText(/공유한 참석 예정자 0명/)).toBeVisible();
  await expect(page).toHaveURL(/\/delivery\?i=/);
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("group-space.png"), fullPage: true });
});

test("groupless invitation does not show a group space", async ({ page }) => {
  await page.route("**/api/delivery/invite?*", (route) => route.fulfill({ json: {
    invite: { name: "개인하객", phoneMasked: null, groupSlug: null, groupName: null },
  } }));
  await page.goto(`/delivery?i=${"b".repeat(32)}`);
  await expect(page.getByRole("textbox", { name: "성함", exact: true })).toHaveValue("개인하객");
  await expect(page.getByRole("region", { name: "우리 모임" })).toHaveCount(0);
});
