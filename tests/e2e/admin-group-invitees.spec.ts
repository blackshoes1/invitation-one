import { test, expect, type Page } from "@playwright/test";

const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
const G = "20000000-0000-0000-0000-000000000001";
type Payload = { member_ids: string[]; group_id?: string; new_group_name?: string; request_id?: string };

async function setup(page: Page, options: { failOnce?: boolean; holdPhone?: Promise<void>; rejectPhone?: boolean } = {}) {
  let members = [
    { id: A, group_id: null as string | null, name: "홍길동", phone: null as string | null, invited_at: "2026-09-01", created_at: "2026-09-01", applied: true, personal: true },
    { id: B, group_id: null as string | null, name: "김하늘", phone: null as string | null, invited_at: null, created_at: "2026-09-01", applied: false, personal: false },
  ];
  const groups = [{ id: G, name: "기존 친구들", slug: "friends", roster_count: 0, member_count: 0 }];
  const requests: Payload[] = [];
  let phoneRequests = 0;
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/admin/invitees/group") {
      const body: Payload = route.request().postDataJSON();
      requests.push(body);
      if (options.failOnce && requests.length === 1) return route.fulfill({ status: 503, json: { error: "잠시 후 다시 시도해주세요." } });
      let group = groups.find((g) => g.id === body.group_id);
      if (!group) {
        group = { id: body.request_id!, name: body.new_group_name!, slug: "new-friends", roster_count: 0, member_count: 0 };
        groups.push(group);
      }
      for (const m of members) if (body.member_ids.includes(m.id)) m.group_id = group.id;
      group.roster_count = members.filter((m) => m.group_id === group.id).length;
      return route.fulfill({ json: { group, assigned_count: body.member_ids.length } });
    }
    if (path === "/api/admin/invitees" && method === "PATCH") {
      phoneRequests++;
      if (options.holdPhone) await options.holdPhone;
      if (options.rejectPhone) return route.fulfill({ status: 400, json: { error: "연락처 형식을 확인해주세요." } });
      const body = route.request().postDataJSON();
      members = members.map((m) => m.id === body.member_id ? { ...m, phone: body.phone } : m);
      return route.fulfill({ json: { member: members.find((m) => m.id === body.member_id) } });
    }
    let json: object = {};
    if (path === "/api/admin/login") json = { ok: true };
    if (path === "/api/admin/groups") json = { groups, total_members: 1 };
    if (path === "/api/admin/invitees") json = { members: members.filter((m) => m.group_id === null) };
    if (path === "/api/admin/deliveries") json = { deliveries: [] };
    const roster = path.match(/^\/api\/admin\/groups\/([^/]+)\/members$/);
    if (roster) json = { members: members.filter((m) => m.group_id === roster[1]) };
    await route.fulfill({ json });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "그룹", exact: true }).click();
  await page.getByRole("button", { name: /개별 초대/ }).click();
  await expect(page.getByRole("checkbox", { name: "홍길동 선택" })).toBeVisible();
  return { requests, phoneRequests: () => phoneRequests };
}

test("모바일에서 개별 인원을 선택해 새 그룹 생성 후 명단을 보여준다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await setup(page);
  await page.getByRole("checkbox", { name: "개별 초대 전체 선택" }).check();
  await page.getByRole("button", { name: "선택 2명 그룹화", exact: true }).click();
  await page.getByRole("textbox", { name: "새 그룹 이름", exact: true }).fill("대학 친구들");
  await page.getByRole("button", { name: "새 그룹 만들고 2명 추가", exact: true }).click();
  await expect(page.getByRole("button", { name: /개별 초대 \(0명\)/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "홍길동 연락처", exact: true })).toBeVisible();
  expect(state.requests).toHaveLength(1);
  expect(state.requests[0]).toMatchObject({ member_ids: [A, B], new_group_name: "대학 친구들" });
  await expect(page.getByText(/기존 개인 링크는 그대로 사용할 수 있어요/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("선택한 사람만 기존 그룹에 추가한다", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("checkbox", { name: "홍길동 선택" }).check();
  await page.getByRole("button", { name: "선택 1명 그룹화", exact: true }).click();
  await page.getByRole("combobox", { name: "그룹 지정" }).selectOption(G);
  await expect(page.getByRole("textbox", { name: "새 그룹 이름", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "그룹에 1명 추가", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "김하늘 선택" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "홍길동 선택" })).toHaveCount(0);
  expect(state.requests).toEqual([{ member_ids: [A], group_id: G }]);
});

test("실패 후 선택과 입력을 보존하고 동일한 요청 ID로 재시도한다", async ({ page }) => {
  const state = await setup(page, { failOnce: true });
  await page.getByRole("checkbox", { name: "홍길동 선택" }).check();
  await page.getByRole("button", { name: "선택 1명 그룹화", exact: true }).click();
  await page.getByRole("textbox", { name: "새 그룹 이름", exact: true }).fill("재시도 친구들");
  const submit = page.getByRole("button", { name: "새 그룹 만들고 1명 추가", exact: true });
  await submit.click();
  await expect(page.getByText("잠시 후 다시 시도해주세요.", { exact: false })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "홍길동 선택" })).toBeChecked();
  await submit.click();
  await expect(page.getByRole("checkbox", { name: "홍길동 선택" })).toHaveCount(0);
  expect(state.requests).toHaveLength(2);
  expect(state.requests[0]).toEqual(state.requests[1]);
});

test("저장 중인 연락처를 기다린 뒤 그룹화한다", async ({ page }) => {
  let release!: () => void;
  const holdPhone = new Promise<void>((resolve) => { release = resolve; });
  const state = await setup(page, { holdPhone });
  await page.getByRole("checkbox", { name: "홍길동 선택" }).check();
  await page.getByRole("button", { name: "선택 1명 그룹화", exact: true }).click();
  await page.getByRole("combobox", { name: "그룹 지정" }).selectOption(G);
  await page.getByRole("textbox", { name: "홍길동 연락처" }).fill("010-1234-5678");
  await page.getByRole("button", { name: "그룹에 1명 추가", exact: true }).click();
  await expect.poll(state.phoneRequests).toBe(1);
  await expect(page.getByRole("button", { name: "저장 중…", exact: true })).toBeDisabled();
  expect(state.requests).toHaveLength(0);
  release();
  await expect(page.getByRole("checkbox", { name: "홍길동 선택" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "홍길동 연락처" })).toHaveValue("010-1234-5678");
  expect(state.requests).toHaveLength(1);
});

test("연락처 저장 실패 시 그룹화를 중단하고 입력을 유지한다", async ({ page }) => {
  const state = await setup(page, { rejectPhone: true });
  await page.getByRole("checkbox", { name: "홍길동 선택" }).check();
  await page.getByRole("button", { name: "선택 1명 그룹화", exact: true }).click();
  await page.getByRole("combobox", { name: "그룹 지정" }).selectOption(G);
  await page.getByRole("textbox", { name: "홍길동 연락처" }).fill("010-12");
  await page.getByRole("button", { name: "그룹에 1명 추가", exact: true }).click();
  await expect(page.getByText("연락처 형식을 확인해주세요.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "그룹에 1명 추가", exact: true })).toBeEnabled();
  await expect(page.getByRole("checkbox", { name: "홍길동 선택" })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "홍길동 연락처" })).toHaveValue("010-12");
  expect(state.requests).toHaveLength(0);
});
