import { test, expect } from "@playwright/test";

/**
 * 신청 뒤에 장소가 바뀌는 일은 흔하다 — 어드민에서 고칠 수 있어야 한다.
 *
 * 여기서 지키는 선은 두 가지다:
 *  1. 장소는 하객 화면과 같은 **시/도 → 시/군/구 선택**이다 (자유 입력이면
 *     배송경로 지도의 핀이 안 붙는다)
 *  2. 예전 자유 입력 값("강남구 또는 암데나")은 **상세 위치에 그대로 실려 열린다.**
 *     못 알아본다고 빈칸으로 열면, 시간대만 고치고 저장하는 순간 하객이 적어둔
 *     장소가 조용히 지워진다.
 */
const LEGACY = "강남구 또는 암데나";

const DELIVERY = {
  id: "d1",
  date: "2026-09-19",
  time_slot: "오전",
  location: LEGACY,
  status: "대기중",
  rider: "신랑",
  tracking_stage: "주문접수",
  hidden: false,
  group_id: null,
  message: null,
  name: "곽통일",
  participants: [{ id: "p1", name: "곽통일", phone: "010-1234-5678", is_owner: true }],
};

test("어드민에서 장소를 시/도·시/군/구로 고친다 — 옛 자유 입력은 상세에 남는다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let patched: Record<string, unknown> | null = null;

  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH") {
      patched = route.request().postDataJSON();
      return route.fulfill({ json: { delivery: DELIVERY, sms: null } });
    }
    let json: object = {};
    if (url.pathname === "/api/admin/login") json = { ok: true };
    if (url.pathname === "/api/admin/groups") json = { groups: [], total_members: 0 };
    if (url.pathname === "/api/admin/deliveries") json = { deliveries: [DELIVERY] };
    if (url.pathname === "/api/admin/invitees") json = { invitees: [] };
    await route.fulfill({ json });
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: "주문", exact: true }).click();
  await expect(page.getByText(LEGACY)).toBeVisible();

  await page.getByRole("button", { name: "📝 일정·장소 수정" }).click();
  // 옛 값은 버려지지 않고 상세 위치에 실려 있어야 한다
  await expect(page.getByRole("textbox", { name: "상세 위치" })).toHaveValue(LEGACY);

  // 시/도·시/군/구를 고르지 않고 저장하면 막고, 왜인지 말해준다
  await page.getByRole("button", { name: "변경 저장" }).click();
  await expect(page.getByText(/시\/도·시\/군\/구를 골라주세요/)).toBeVisible();
  expect(patched).toBeNull();

  await page.getByRole("combobox", { name: "시/도" }).selectOption("서울");
  await page.getByRole("combobox", { name: "시/군/구" }).selectOption("강남구");
  await page.getByRole("textbox", { name: "상세 위치" }).fill("강남역 2번 출구");
  await page.getByRole("button", { name: "변경 저장" }).click();

  await expect.poll(() => patched).not.toBeNull();
  // 첫 낱말이 시/도여야 배송경로 지도에 핀이 붙는다
  expect(patched!.location).toBe("서울 강남구 강남역 2번 출구");
  expect(errors).toEqual([]);
});

test("합석 제안 장소도 같은 선택이다 — 반쪽짜리 지역은 막는다", async ({ page }) => {
  let patched: Record<string, unknown> | null = null;
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH") {
      patched = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    }
    let json: object = {};
    if (url.pathname === "/api/admin/login") json = { ok: true };
    if (url.pathname === "/api/admin/groups")
      json = {
        groups: [
          // 예전 자유 입력으로 남은 제안 장소
          { id: "g1", name: "테스트 모임", slug: "t", roster_count: 0, member_count: 0,
            offer_date: "2026-09-19", offer_time: "오전", offer_location: "강남역 근처 암데나" },
        ],
        total_members: 0,
      };
    if (url.pathname === "/api/admin/deliveries") json = { deliveries: [] };
    if (url.pathname === "/api/admin/invitees") json = { invitees: [] };
    await route.fulfill({ json });
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: "그룹", exact: true }).click();
  await page.getByRole("button", { name: "📅", exact: true }).click();

  // 옛 자유 입력은 버려지지 않고 상세로 실려 온다
  await expect(page.getByRole("textbox", { name: "제안 상세 위치", exact: true })).toHaveValue("강남역 근처 암데나");
  await page.getByRole("button", { name: "제안 저장" }).click();
  await expect(page.getByText(/시\/도·시\/군\/구를 고른 뒤/)).toBeVisible();
  expect(patched).toBeNull();

  await page.getByRole("combobox", { name: "제안 시/도", exact: true }).selectOption("서울");
  await page.getByRole("combobox", { name: "제안 시/군/구", exact: true }).selectOption("강남구");
  await page.getByRole("button", { name: "제안 저장" }).click();
  await expect.poll(() => patched).not.toBeNull();
  expect(patched!.offer_location).toBe("서울 강남구 강남역 근처 암데나");
});

test("시/도를 바꾸면 이전 시/군/구는 비워진다 — 서울 강남구가 부산에 남으면 안 된다", async ({ page }) => {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    let json: object = {};
    if (url.pathname === "/api/admin/login") json = { ok: true };
    if (url.pathname === "/api/admin/groups") json = { groups: [], total_members: 0 };
    if (url.pathname === "/api/admin/deliveries")
      json = { deliveries: [{ ...DELIVERY, location: "서울 강남구" }] };
    if (url.pathname === "/api/admin/invitees") json = { invitees: [] };
    await route.fulfill({ json });
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: "주문", exact: true }).click();
  await page.getByRole("button", { name: "📝 일정·장소 수정" }).click();
  await expect(page.getByRole("combobox", { name: "시/군/구" })).toHaveValue("강남구");
  await page.getByRole("combobox", { name: "시/도" }).selectOption("부산");
  await expect(page.getByRole("combobox", { name: "시/군/구" })).toHaveValue("");
});
