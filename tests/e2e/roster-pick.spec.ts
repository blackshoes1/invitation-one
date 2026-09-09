import { test, expect } from "@playwright/test";

/**
 * 그룹 링크(단톡방에 뿌리는 한 개의 주소)로 들어온 하객의 이름·연락처 채우기.
 *
 * 개인 초대 링크(`?i=`)와 달리 그룹 링크는 **누가 눌렀는지 서버가 알 수 없다.**
 * 그래서 자동으로 채우는 대신 명단에서 **고르게** 한다.
 *
 * 고를 기회는 **페이지를 열자마자** 와야 한다 — 처음에는 이름 입력칸 옆 작은
 * 링크로만 뒀는데 메뉴를 누르고 들어가야 나오는 자리라 있는 줄도 모르고
 * 지나쳤다 (2026-09-09). 그래서 첫 화면 카드가 주 경로다.
 *
 * 이 스펙이 지키는 선: **번호는 한 자리도 화면에 나오지 않는다.** 명단에 번호가
 * 있으면 제출 시점에 서버가 붙이고, 화면에는 "명단에 있는 번호로 보낼게요" 만
 * 뜬다. 마스킹본조차 내려보내면 링크를 가진 누구나 남의 뒷자리를 알 수 있다.
 */
test.use({ viewport: { width: 390, height: 844 } });

const CARD = "명단에서 본인 고르기";
const PICKER = "명단에서 내 이름 찾기 👤";

// 슬러그는 **실재하는 것**이어야 한다. Supabase 미설정 프로필에서는 어떤
// 슬러그든 데모 그룹으로 떨어지지만, E2E_DB 프로필에서는 get_group 이 진짜로
// 조회돼 없는 슬러그면 "그룹을 찾을 수 없어요" 만 뜨고 메뉴가 아예 없다.
// e2e-group 은 scripts/e2e-db-ci.sh 가 심는 그룹이라 두 프로필 모두에서 산다.
const GROUP = "/delivery/group/e2e-group";

/** 홍길동은 명단에 번호가 있고, 김철수는 없다 (혹은 동명이인) */
const ROSTER = {
  names: [
    { name: "김철수", hasPhone: false },
    { name: "홍길동", hasPhone: true },
  ],
};

test("첫 화면에서 고르면 이름이 채워지고 연락처는 서버가 붙인다", async ({ page }) => {
  let rosterCalls = 0;
  await page.route("**/api/delivery/group/roster*", (route) => {
    rosterCalls += 1;
    return route.fulfill({ json: ROSTER });
  });

  await page.goto(GROUP);

  const card = page.getByRole("region", { name: CARD });
  await expect(card).toBeVisible(); // 메뉴를 누르기 전, 첫 화면에 있다
  // 누르기 전에는 명단을 내려받지 않는다 — 안 고르는 사람에게까지 뿌릴 이유가 없다
  expect(rosterCalls).toBe(0);

  await card.getByRole("button", { name: "명단에서 내 이름 고르기" }).click();
  await card.getByRole("button", { name: "홍길동", exact: true }).click();
  expect(rosterCalls).toBe(1);

  const picked = page.getByRole("region", { name: "명단에서 고른 이름" });
  await expect(picked).toContainText("홍길동");
  await expect(picked).toContainText("명단에 있는 번호");

  await page.getByRole("button", { name: /종이 청첩장 직접 받기/ }).click();

  await expect(page.getByRole("textbox", { name: "성함", exact: true })).toHaveValue(
    "홍길동"
  );
  // 번호 입력칸이 사라지고 안내만 남는다 — 번호는 제출 시 서버가 붙인다
  await expect(page.getByRole("textbox", { name: "연락처" })).toHaveCount(0);
  await expect(page.getByText("명단에 있는 홍길동님 번호로 보낼게요")).toBeVisible();

  // 어디에도 번호가 없어야 한다 (마스킹본조차)
  expect(await page.content()).not.toMatch(/\d{3,4}-\*{2,}|\d{3}-\d{3,4}-\d{4}/);
});

test("명단에 번호가 없는 사람은 직접 입력한다", async ({ page }) => {
  await page.route("**/api/delivery/group/roster*", (route) =>
    route.fulfill({ json: ROSTER })
  );
  await page.goto(GROUP);

  const card = page.getByRole("region", { name: CARD });
  await card.getByRole("button", { name: "명단에서 내 이름 고르기" }).click();
  await card.getByRole("button", { name: "김철수", exact: true }).click();

  await page.getByRole("button", { name: /종이 청첩장 직접 받기/ }).click();
  await expect(page.getByRole("textbox", { name: "성함", exact: true })).toHaveValue(
    "김철수"
  );
  await expect(page.getByRole("textbox", { name: "연락처" })).toHaveValue("");
});

test("다른 번호를 쓰겠다고 하면 입력칸이 돌아온다", async ({ page }) => {
  await page.route("**/api/delivery/group/roster*", (route) =>
    route.fulfill({ json: ROSTER })
  );
  await page.goto(GROUP);
  const card = page.getByRole("region", { name: CARD });
  await card.getByRole("button", { name: "명단에서 내 이름 고르기" }).click();
  await card.getByRole("button", { name: "홍길동", exact: true }).click();
  await page.getByRole("button", { name: /종이 청첩장 직접 받기/ }).click();

  await page.getByRole("button", { name: "다른 번호 입력" }).click();
  await expect(page.getByRole("textbox", { name: "연락처" })).toHaveValue("");
});

test("첫 화면을 지나쳐도 이름칸 옆에서 고를 수 있다", async ({ page }) => {
  await page.route("**/api/delivery/group/roster*", (route) =>
    route.fulfill({ json: ROSTER })
  );

  await page.goto(GROUP);
  await page.getByRole("button", { name: /종이 청첩장 직접 받기/ }).click();

  const nameBox = page.getByRole("textbox", { name: "성함", exact: true });
  await expect(nameBox).toHaveValue("");
  await page.getByRole("button", { name: PICKER }).click();
  await page.getByRole("button", { name: "홍길동", exact: true }).click();
  await expect(nameBox).toHaveValue("홍길동");
  await expect(page.getByText("명단에 있는 홍길동님 번호로 보낼게요")).toBeVisible();
});

test("이름을 손으로 고치면 명단 번호를 더는 쓰지 않는다", async ({ page }) => {
  // 누구 번호인지 보장이 깨진다 — 엉뚱한 사람 번호가 붙으면 안 된다
  await page.route("**/api/delivery/group/roster*", (route) =>
    route.fulfill({ json: ROSTER })
  );
  await page.goto(GROUP);
  const card = page.getByRole("region", { name: CARD });
  await card.getByRole("button", { name: "명단에서 내 이름 고르기" }).click();
  await card.getByRole("button", { name: "홍길동", exact: true }).click();
  await page.getByRole("button", { name: /종이 청첩장 직접 받기/ }).click();

  await page.getByRole("textbox", { name: "성함", exact: true }).fill("홍길순");
  await expect(page.getByRole("textbox", { name: "연락처" })).toHaveValue("");
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
