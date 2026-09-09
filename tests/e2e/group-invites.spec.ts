import { test, expect, type Page } from "@playwright/test";

async function admin(page: Page, failSave = false) {
  let savedPhone = "010-1234-5678";
  const calls: string[] = [];
  const inviteBodies: unknown[] = [];
  await page.route("**/api/admin/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let json: object = {};
    if (path === "/api/admin/login") json = { ok: true };
    if (path === "/api/admin/groups") json = {
      groups: [{ id: "g1", name: "테스트 그룹", slug: "friends", roster_count: 1, member_count: 0 }],
      total_members: 0,
    };
    if (path === "/api/admin/deliveries") json = { deliveries: [] };
    if (path === "/api/admin/invitees") json = { invitees: [] };
    const member = () => ({ id: "m1", name: "테스트하객", phone: savedPhone, invited_at: null });
    if (path === "/api/admin/groups/g1/members") {
      if (req.method() === "PATCH") {
        calls.push("save");
        if (failSave) return route.fulfill({ status: 500, json: { error: "저장 실패 테스트" } });
        savedPhone = req.postDataJSON().phone;
        json = { member: member() };
      } else json = { members: [member()] };
    }
    if (path === "/api/admin/groups/g1/members/invite") {
      calls.push("invite");
      inviteBodies.push(req.postDataJSON());
      json = { links: [{ id: "m1", name: "테스트하객",
        invited_at: "2026-09-09T01:00:00Z",
        url: "https://example.invalid/delivery/group/friends?i=" + "a".repeat(32),
        personalUrl: "https://example.invalid/delivery?i=" + "a".repeat(32),
      }], skipped: [] };
    }
    await route.fulfill({ json });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "그룹", exact: true }).click();
  await page.getByRole("button", { name: "명단 ▼", exact: true }).click();
  return { calls, inviteBodies };
}

test("saves edited phone before copying, reuses server link after reload, and separates rotation", async ({ page }) => {
  const state = await admin(page);
  const row = page.getByRole("listitem").filter({ hasText: "테스트하객" });
  await row.getByRole("textbox", { name: "테스트하객 연락처" }).fill("010-9999-8888");
  await expect(row.getByRole("status")).toContainText("아직 저장 안 됨");
  await row.getByRole("button", { name: "그룹 합류 링크", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "복사할 초대 링크" })).toHaveValue(/\/delivery\/group\/friends\?i=/);
  expect(state.calls).toEqual(["save", "invite"]);
  await expect(row.getByRole("status")).toHaveText("자동 입력 준비 완료");
  expect(state.inviteBodies[0]).toEqual({ member_id: "m1", rotate: false });
  const url = await page.getByRole("textbox", { name: "복사할 초대 링크" }).inputValue();

  await page.reload();
  await page.getByRole("button", { name: "그룹", exact: true }).click();
  await page.getByRole("button", { name: "명단 ▼", exact: true }).click();
  await row.getByRole("button", { name: "그룹 합류 링크", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "복사할 초대 링크" })).toHaveValue(url);
  expect(state.inviteBodies[1]).toEqual({ member_id: "m1", rotate: false });

  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "링크 재발급", exact: true }).click();
  await expect.poll(() => state.inviteBodies.length).toBe(3);
  expect(state.inviteBodies[2]).toEqual({ member_id: "m1", rotate: true });
});

test("failed phone save prevents invitation issuance and retains input for retry", async ({ page }) => {
  const state = await admin(page, true);
  await page.getByRole("textbox", { name: "테스트하객 연락처" }).fill("010-9999-8888");
  await page.getByRole("button", { name: "그룹 합류 링크", exact: true }).click();
  await expect(page.getByText(/저장 실패 테스트/)).toBeVisible();
  expect(state.calls).toEqual(["save"]);
  await expect(page.getByRole("textbox", { name: "테스트하객 연락처" })).toHaveValue("010-9999-8888");
  await expect(page.getByRole("textbox", { name: "복사할 초대 링크" })).toHaveCount(0);
});

test("bulk group copy reports exclusions and leaves manually selectable links when clipboard fails", async ({ page }) => {
  await admin(page);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    value: { writeText: () => Promise.reject(new Error("blocked")) }, configurable: true,
  }));
  await page.route("**/api/admin/groups/g1/members/invite", (route) => {
    expect(route.request().postDataJSON()).toEqual({ all: true });
    return route.fulfill({ json: {
      links: [{ id: "m1", name: "테스트하객", invited_at: "2026-09-09T01:00:00Z",
        url: "https://example.invalid/delivery/group/friends?i=" + "a".repeat(32) }],
      skipped: [{ id: "m2", name: "번호없는하객", reason: "연락처를 먼저 저장해주세요." }],
    } });
  });
  await page.getByRole("button", { name: "그룹 합류 링크 전체 복사", exact: true }).click();
  const result = page.getByRole("region", { name: "초대 링크 복사 결과" });
  await expect(result.getByRole("textbox")).toHaveValue(/^테스트하객: .*\/group\/friends/);
  await expect(result.getByText("번호없는하객: 연락처를 먼저 저장해주세요.")).toBeVisible();
  await expect(page.getByText("링크는 준비됐어요. 아래 주소를 선택해 직접 복사해주세요.")).toBeVisible();
});

for (const path of ["/delivery", "/delivery/group/friends"]) {
  test(`wrong recipient clears identity and conversion state on ${path}`, async ({ page }) => {
    await page.route("**/rest/v1/rpc/get_group", (route) => route.fulfill({ json: [{ id: "g1", name: "친구들", slug: "friends" }] }));
    await page.route("**/rest/v1/rpc/get_group_orders", (route) => route.fulfill({ json: [] }));
    await page.route("**/rest/v1/rpc/get_delivery_guest_count", (route) => route.fulfill({ json: 0 }));
    await page.route("**/api/delivery/invite?*", (route) => route.fulfill({ json: {
      invite: { name: "원래수신자", phoneMasked: "010-****-5678", groupSlug: "friends", groupName: "친구들" },
    } }));
    await page.goto(`${path}?i=${"a".repeat(32)}&convert=old-person`);
    await expect(page.getByRole("region", { name: "초대받은 분 확인" })).toContainText("원래수신자");
    // Seed an old recipient's persisted draft after the form has mounted.
    await page.evaluate(() => sessionStorage.setItem("delivery-form-draft", JSON.stringify({
      date: "2026-09-25", slot: "오후", rider: "신랑", message: "이전 사람의 요청",
    })));
    await page.getByRole("button", { name: "본인이 아닌가요?", exact: false }).click();
    await expect(page).toHaveURL(new RegExp(path + "$"));
    await expect(page.getByRole("region", { name: "초대받은 분 확인" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "우리 모임" })).toHaveCount(0);
    await expect(page.getByText("원래수신자", { exact: false })).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem("delivery-form-draft"))).toBeNull();
  });
}

test("invalid invitation prioritizes retry and a new personal link request", async ({ page }) => {
  await page.route("**/api/delivery/invite?*", (route) => route.fulfill({ status: 401, json: { error: "invalid" } }));
  await page.goto("/delivery?i=" + "b".repeat(32));
  await expect(page.getByText(/본인 전용 링크를 다시 요청해주세요/)).toBeVisible();
  await expect(page.getByRole("button", { name: "링크 다시 확인", exact: true })).toBeVisible();
});

test("draft survives same-person reload and is cleared when the invitation changes", async ({ page }) => {
  await page.route("**/api/delivery/invite?*", (route) => route.fulfill({ json: {
    invite: { name: "초대하객", phoneMasked: "010-****-5678", groupSlug: null, groupName: null },
  } }));
  await page.goto(`/delivery?i=${"a".repeat(32)}`);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("delivery-form-draft") ?? "null")?.scope)).toBeTruthy();
  await page.evaluate(() => {
    const saved = JSON.parse(sessionStorage.getItem("delivery-form-draft")!);
    saved.draft = { date: "2026-09-25", slot: "오후", rider: "신랑", message: "첫 사람 요청" };
    sessionStorage.setItem("delivery-form-draft", JSON.stringify(saved));
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "초대하객님, 반가워요 👋" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("delivery-form-draft") ?? "null")?.draft.message)).toBe("첫 사람 요청");
  await page.goto(`/delivery?i=${"b".repeat(32)}`);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("delivery-form-draft") ?? "null")?.draft.message)).toBe("");
  expect(await page.evaluate(() => sessionStorage.getItem("delivery-form-draft"))).not.toContain("b".repeat(32));
});
