import { test, expect } from "@playwright/test";

/**
 * 그룹 링크(단톡방에 뿌리는 한 개의 주소)로 들어온 하객의 이름 채우기.
 *
 * 개인 초대 링크(`?i=`)와 달리 그룹 링크는 **누가 눌렀는지 서버가 알 수 없다.**
 * 그래서 자동으로 채우는 대신 명단에서 **고르게** 한다.
 *
 * 이 스펙이 지키는 선: 골라도 채워지는 건 **이름뿐**이고, 명단은 **누르기 전에는
 * 내려오지 않으며**, 그룹이 아닌 개인 주문 페이지에는 아예 나타나지 않는다.
 */
test.use({ viewport: { width: 390, height: 844 } });

const PICKER = "명단에서 내 이름 찾기 👤";

test("그룹 링크 — 명단에서 고르면 이름이 채워진다 (연락처는 그대로 비어 있다)", async ({
  page,
}) => {
  let rosterCalls = 0;
  await page.route("**/api/delivery/group/roster*", (route) => {
    rosterCalls += 1;
    return route.fulfill({ json: { names: ["김철수", "홍길동"] } });
  });

  // 슬러그는 **실재하는 것**이어야 한다. Supabase 미설정 프로필에서는 어떤
  // 슬러그든 데모 그룹으로 떨어지지만, E2E_DB 프로필에서는 get_group 이 진짜로
  // 조회돼 없는 슬러그면 "그룹을 찾을 수 없어요" 만 뜨고 메뉴가 아예 없다.
  // e2e-group 은 scripts/e2e-db-ci.sh 가 심는 그룹이라 두 프로필 모두에서 산다.
  await page.goto("/delivery/group/e2e-group");
  await page.getByRole("button", { name: /종이 청첩장 직접 받기/ }).click();

  const nameBox = page.getByRole("textbox", { name: "성함", exact: true });
  await expect(nameBox).toBeVisible();
  // 누르기 전에는 명단을 내려받지 않는다 — 안 고르는 사람에게까지 뿌릴 이유가 없다
  expect(rosterCalls).toBe(0);

  await page.getByRole("button", { name: PICKER }).click();
  await page.getByRole("button", { name: "홍길동", exact: true }).click();

  expect(rosterCalls).toBe(1);
  await expect(nameBox).toHaveValue("홍길동");
  // 이름만이다. 연락처까지 채워주면 그룹 링크가 남의 정보 조회 수단이 된다.
  await expect(page.getByRole("textbox", { name: "연락처" })).toHaveValue("");
});

test("그룹이 아닌 개인 주문 페이지에는 명단 고르기가 없다", async ({ page }) => {
  await page.goto("/delivery");
  await page.getByRole("button", { name: /종이 청첩장 직접 받기/ }).click();
  await expect(page.getByRole("textbox", { name: "성함", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: PICKER })).toHaveCount(0);
});
