import { test, expect } from "@playwright/test";

const DELIVERY = {
  id: "d1",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  group_id: null,
  name: "김관리",
  phone: "010-0000-0000",
  location: "서울 강남구 강남역 2번 출구",
  date: "2026-09-19",
  time_slot: "오전",
  party_size: 2,
  message: null,
  status: "확정",
  tracking_stage: "준비중",
  review_rating: null,
  review_text: null,
  hidden: false,
  participants: [
    { id: "p1", name: "김관리", phone: "010-0000-0000", is_owner: true },
    { id: "p2", name: "이동행", phone: "010-1111-1111", is_owner: false },
  ],
};

test("캘린더 날짜를 누르면 주문 요약 레이어가 열린다", async ({ page }) => {
  const changes: { dates: string[]; block: boolean }[] = [];
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/blocked" && route.request().method() === "POST") {
      changes.push(route.request().postDataJSON());
      return route.fulfill({ json: { done: 1 } });
    }
    let json: object = {};
    if (path === "/api/admin/login") json = { ok: true };
    if (path === "/api/admin/groups") json = { groups: [], total_members: 0 };
    if (path === "/api/admin/deliveries") json = { deliveries: [DELIVERY] };
    if (path === "/api/admin/blocked") json = { dates: [DELIVERY.date] };
    if (path === "/api/admin/invitees") json = { invitees: [] };
    await route.fulfill({ json });
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: "캘린더", exact: true }).click();
  await page.getByRole("button", { name: /9월 19일.*주문 정보, 1건/ }).click();

  const dialog = page.getByRole("dialog", { name: "9월 19일 (토)" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("신규 신청 마감됨");
  await expect(dialog).toContainText("김관리 외 1명");
  await expect(dialog).toContainText("오전 · 2명");
  await expect(dialog).toContainText("서울 강남구 강남역 2번 출구");

  await dialog.getByRole("button", { name: "마감 작업에 선택" }).click();
  await expect(dialog.getByRole("button", { name: "마감 작업 선택 해제" })).toBeVisible();
  await dialog.getByRole("button", { name: "이 날짜 마감 해제", exact: true }).click();
  await expect(dialog).toContainText("신규 신청 가능");
  await dialog.getByRole("button", { name: "이 날짜 마감", exact: true }).click();
  await expect(dialog).toContainText("신규 신청 마감됨");
  expect(changes).toEqual([
    { dates: [DELIVERY.date], block: false },
    { dates: [DELIVERY.date], block: true },
  ]);
  await expect(dialog).toContainText("김관리 외 1명");
  await dialog.getByRole("button", { name: "마감 작업에 선택" }).click();
  await dialog.getByRole("button", { name: "확인" }).click();
  await expect(page.getByText("1개 선택")).toBeVisible();
});
