import { test, expect } from "@playwright/test";

/**
 * 그룹 링크(단톡방에 뿌리는 한 개의 주소)로 들어온 하객의 이름 채우기.
 *
 * 개인 초대 링크(`?i=`)와 달리 그룹 링크는 **누가 눌렀는지 서버가 알 수 없다.**
 * 그래서 자동으로 채우는 대신 명단에서 **고르게** 한다.
 *
 * 고를 기회는 **페이지를 열자마자** 와야 한다 — 처음에는 이름 입력칸 옆 작은
 * 링크로만 뒀는데 메뉴를 누르고 들어가야 나오는 자리라 있는 줄도 모르고
 * 지나쳤다 (2026-09-09). 그래서 첫 화면 카드가 주 경로다.
 *
 * 이 스펙이 지키는 선: 골라도 채워지는 건 **이름뿐**이고, 명단은 **누르기 전에는
 * 내려오지 않으며**, 그룹이 아닌 개인 주문 페이지에는 아예 나타나지 않는다.
 */
test.use({ viewport: { width: 390, height: 844 } });

const CARD = "명단에서 본인 고르기";
const PICKER = "명단에서 내 이름 찾기 👤";

// 슬러그는 **실재하는 것**이어야 한다. Supabase 미설정 프로필에서는 어떤
// 슬러그든 데모 그룹으로 떨어지지만, E2E_DB 프로필에서는 get_group 이 진짜로
// 조회돼 없는 슬러그면 "그룹을 찾을 수 없어요" 만 뜨고 메뉴가 아예 없다.
// e2e-group 은 scripts/e2e-db-ci.sh 가 심는 그룹이라 두 프로필 모두에서 산다.
const GROUP = "/delivery/group/e2e-group";

test("첫 화면에서 고른 이름이 신청서에 채워진다 (연락처는 그대로 비어 있다)", async ({
  page,
}) => {
  let rosterCalls = 0;
  await page.route("**/api/delivery/group/roster*", (route) => {
    rosterCalls += 1;
    return route.fulfill({ json: { names: ["김철수", "홍길동"] } });
  });

  await page.goto(GROUP);

  const card = page.getByRole("region", { name: CARD });
  await expect(card).toBeVisible(); // 메뉴를 누르기 전, 첫 화면에 있다
  // 누르기 전에는 명단을 내려받지 않는다 — 안 고르는 사람에게까지 뿌릴 이유가 없다
  expect(rosterCalls).toBe(0);

  await card.getByRole("button", { name: "명단에서 내 이름 고르기" }).click();
  await card.getByRole("button", { name: "홍길동", exact: true }).click();
  expect(rosterCalls).toBe(1);

  // 고른 뒤에는 누구로 채울지 화면에 남아 있고, 되돌릴 수 있다
  const picked = page.getByRole("region", { name: "명단에서 고른 이름" });
  await expect(picked).toContainText("홍길동");
  await expect(picked.getByRole("button", { name: "다시 고르기" })).toBeVisible();

  await page.getByRole("button", { name: /종이 청첩장 직접 받기/ }).click();

  await expect(page.getByRole("textbox", { name: "성함", exact: true })).toHaveValue(
    "홍길동"
  );
  // 이름만이다. 연락처까지 채워주면 그룹 링크가 남의 정보 조회 수단이 된다.
  await expect(page.getByRole("textbox", { name: "연락처" })).toHaveValue("");
});

test("첫 화면을 지나쳐도 이름칸 옆에서 고를 수 있다", async ({ page }) => {
  await page.route("**/api/delivery/group/roster*", (route) =>
    route.fulfill({ json: { names: ["김철수", "홍길동"] } })
  );

  await page.goto(GROUP);
  await page.getByRole("button", { name: /종이 청첩장 직접 받기/ }).click();

  const nameBox = page.getByRole("textbox", { name: "성함", exact: true });
  await expect(nameBox).toHaveValue("");
  await page.getByRole("button", { name: PICKER }).click();
  await page.getByRole("button", { name: "김철수", exact: true }).click();
  await expect(nameBox).toHaveValue("김철수");
});

test("명단이 비어 있으면 첫 화면 카드를 접는다", async ({ page }) => {
  await page.route("**/api/delivery/group/roster*", (route) =>
    route.fulfill({ json: { names: [] } })
  );
  await page.goto(GROUP);
  const card = page.getByRole("region", { name: CARD });
  await card.getByRole("button", { name: "명단에서 내 이름 고르기" }).click();
  await expect(card).toHaveCount(0); // 열어봤자 고를 게 없다
});

test("그룹이 아닌 개인 주문 페이지에는 명단 고르기가 없다", async ({ page }) => {
  await page.goto("/delivery");
  await expect(page.getByRole("region", { name: CARD })).toHaveCount(0);
  await page.getByRole("button", { name: /종이 청첩장 직접 받기/ }).click();
  await expect(page.getByRole("textbox", { name: "성함", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: PICKER })).toHaveCount(0);
});
