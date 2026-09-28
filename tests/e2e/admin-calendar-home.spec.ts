import { test, expect, type Page } from "@playwright/test";

/**
 * 어드민 첫 화면은 캘린더다.
 *  - 오늘 주문이 있으면 캘린더 위에 바로 보인다 (없으면 카드 자체가 없다)
 *  - 캘린더 날짜 → 그날 주문 목록 → 주문을 누르면 주문 상세로 간다
 *  - 주문 상세는 주소(?order=)에 남아 뒤로가기로 캘린더에 돌아온다
 */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const TODAY = ymd(new Date());

const order = (id: string, date: string, name: string) => ({
  id, date, name,
  created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
  group_id: null, phone: "010-0000-0000", location: "서울 강남구 강남역 2번 출구",
  time_slot: "오전", party_size: 1, message: null, status: "확정",
  tracking_stage: "준비중", review_rating: null, review_text: null, hidden: false,
  participants: [{ id: `p-${id}`, name, phone: "010-0000-0000", is_owner: true }],
});

async function mockAdmin(page: Page, deliveries: object[]) {
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: object = {};
    if (path === "/api/admin/login") json = { ok: true };
    if (path === "/api/admin/groups") json = { groups: [], total_members: 0 };
    if (path === "/api/admin/deliveries") json = { deliveries };
    if (path === "/api/admin/blocked") json = { dates: [] };
    if (path === "/api/admin/invitees") json = { invitees: [] };
    await route.fulfill({ json });
  });
}

test("로그인하면 캘린더가 먼저 뜨고, 오늘 주문이 있으면 함께 보인다", async ({ page }) => {
  await mockAdmin(page, [order("today1", TODAY, "오늘하객"), order("other", "2026-10-02", "다른날하객")]);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "캘린더", exact: true })).toBeVisible();

  const today = page.getByRole("region", { name: "오늘의 주문" });
  await expect(today).toContainText("오늘하객");
  await expect(today).not.toContainText("다른날하객");

  // 오늘 주문을 누르면 주문 상세
  await today.getByRole("button", { name: "오늘하객 주문 상세 보기" }).click();
  await expect(page.getByRole("heading", { name: "주문 상세" })).toBeVisible();
  await expect(page).toHaveURL(/\?order=today1$/);
  await expect(page.getByText("오늘하객").first()).toBeVisible();

  // 돌아가기 → 캘린더
  await page.getByRole("button", { name: "← 캘린더로 돌아가기" }).click();
  await expect(page.getByRole("heading", { name: "캘린더", exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/order=/);
});

test("오늘 주문이 없으면 오늘 카드가 없다", async ({ page }) => {
  await mockAdmin(page, [order("other", "2026-10-02", "다른날하객")]);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "캘린더", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "오늘의 주문" })).toHaveCount(0);
});

test("캘린더 날짜의 주문을 누르면 상세로 가고, 브라우저 뒤로가기로 캘린더에 돌아온다", async ({ page }) => {
  await mockAdmin(page, [order("d1", "2026-10-02", "김관리")]);
  await page.goto("/admin");
  await page.getByRole("button", { name: /10월 2일.*주문 정보, 1건/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "김관리 주문 상세 보기" }).click();

  await expect(page.getByRole("heading", { name: "주문 상세" })).toBeVisible();
  await expect(page).toHaveURL(/\?order=d1$/);
  // 상세 화면에는 한 건뿐이라 합칠 대상을 고를 수 없다 — 합치기 버튼이 없어야 한다
  await expect(page.getByRole("button", { name: /합치기/ })).toHaveCount(0);

  await page.goBack();
  await expect(page.getByRole("heading", { name: "캘린더", exact: true })).toBeVisible();
});

test("주문 상세 주소로 바로 들어와도 그 주문이 열린다", async ({ page }) => {
  await mockAdmin(page, [order("d1", "2026-10-02", "김관리")]);
  await page.goto("/admin?order=d1");
  await expect(page.getByRole("heading", { name: "주문 상세" })).toBeVisible();
  await expect(page.getByText("김관리").first()).toBeVisible();
});
