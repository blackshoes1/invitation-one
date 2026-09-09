import { test, expect } from "@playwright/test";

/**
 * "어드민 > 그룹 > 명단에서 전화번호가 저장이 안 된다."
 *
 * 서버(PATCH)는 멀쩡했다 — 실제로 저장된 명단이 있다. 문제는 화면이었다.
 * 저장 수단이 작은 밑줄 링크 하나뿐인데, 그걸 안 눌러도 입력칸에는 방금 친
 * 번호가 그대로 남아 있어서 **저장된 것처럼 보였다.** 새로고침하면 사라졌다.
 *
 * 그래서 여기서 지키는 선: **칸을 벗어나거나 Enter 를 누르면 저장된다.**
 * 그리고 아직 저장 안 된 값은 눈에 띄게 남는다.
 */
const MEMBER = {
  id: "m1",
  group_id: "g1",
  name: "홍길동",
  phone: null as string | null,
  invited_at: null,
  created_at: "2026-09-01",
  applied: false,
  personal: false,
  heart: false,
  attendance: null,
  attendance_shared: false,
};

async function openRoster(
  page: import("@playwright/test").Page,
  onPatch: (body: Record<string, unknown>) => void
) {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      onPatch(body);
      return route.fulfill({ json: { member: { ...MEMBER, phone: body.phone } } });
    }
    let json: object = {};
    if (url.pathname === "/api/admin/login") json = { ok: true };
    if (url.pathname === "/api/admin/groups")
      json = { groups: [{ id: "g1", name: "테스트 모임", slug: "t", roster_count: 1, member_count: 0 }], total_members: 1 };
    if (url.pathname === "/api/admin/groups/g1/members") json = { members: [MEMBER] };
    if (url.pathname === "/api/admin/deliveries") json = { deliveries: [] };
    if (url.pathname === "/api/admin/invitees") json = { invitees: [] };
    await route.fulfill({ json });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "그룹", exact: true }).click();
  await page.getByRole("button", { name: "명단 ▼", exact: true }).click();
  return page.getByRole("textbox", { name: "홍길동 연락처" });
}

test("칸을 벗어나면 저장된다 — 버튼을 안 눌러도", async ({ page }) => {
  const patches: Record<string, unknown>[] = [];
  const input = await openRoster(page, (b) => patches.push(b));
  await input.fill("01012345678");
  // 자동 정돈 — 저장 형식과 어긋나지 않게 하객 화면과 같은 규칙을 쓴다
  await expect(input).toHaveValue("010-1234-5678");
  await expect(page.getByText("아직 저장 안 됨", { exact: false })).toBeVisible();

  await input.blur();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toMatchObject({ member_id: "m1", phone: "010-1234-5678" });
  await expect(page.getByText("아직 저장 안 됨", { exact: false })).toHaveCount(0);
});

test("Enter 로도 저장된다", async ({ page }) => {
  const patches: Record<string, unknown>[] = [];
  const input = await openRoster(page, (b) => patches.push(b));
  await input.fill("010-9999-8888");
  await input.press("Enter");
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toMatchObject({ phone: "010-9999-8888" });
});

test("덜 친 번호는 자동 저장하지 않는다 — 서버 400 대신 '저장 안 됨'이 남는다", async ({ page }) => {
  const patches: Record<string, unknown>[] = [];
  const input = await openRoster(page, (b) => patches.push(b));
  await input.fill("010-12");
  await input.blur();
  await expect(page.getByText("아직 저장 안 됨", { exact: false })).toBeVisible();
  expect(patches).toEqual([]);
  // 값은 사라지지 않는다 — 이어서 마저 칠 수 있어야 한다
  await expect(input).toHaveValue("010-12");
});
