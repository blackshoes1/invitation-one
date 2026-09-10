import { test, expect, type Page } from "@playwright/test";

const token = "d".repeat(32);
async function invitePage(page: Page) {
  const writes: string[] = [];
  await page.clock.setFixedTime(new Date("2026-09-09T00:00:00Z"));
  await page.route("**/api/delivery/invite?*", (route) =>
    route.fulfill({
      json: {
        invite: {
          name: "테스트하객",
          phoneMasked: "010-****-5678",
          groupSlug: "friends",
          groupName: "친구들 모임",
        },
      },
    }),
  );
  await page.route("**/api/delivery/group-space", (route) => {
    if (route.request().postDataJSON().action === "save")
      writes.push("attendance");
    return route.fulfill({
      json: {
        space: {
          groupName: "친구들 모임",
          rosterCount: 2,
          sharedAttendingCount: 0,
          me: { name: "테스트하객", attendance: null, shareWithGroup: false },
          members: [],
          schedules: [],
        },
      },
    });
  });
  await page.route("**/rest/v1/rpc/get_booked_dates", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/rest/v1/rpc/get_orders_on_date", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/rest/v1/rpc/get_delivery_guest_count", (route) =>
    route.fulfill({ json: 0 }),
  );
  await page.route("**/api/delivery/create", (route) => {
    writes.push("order");
    return route.fulfill({
      json: { participant_id: "test-person", manage_token: "a".repeat(32) },
    });
  });
  await page.route("**/api/notify", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto(`/delivery?i=${token}`);
  return writes;
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`first action is visible and attendance is optional at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const writes = await invitePage(page);
    const cta = page.getByRole("button", { name: /청첩장 받을 일정 정하기/ });
    await expect(cta).toBeInViewport({ ratio: 1 });
    await expect(
      page.getByRole("region", { name: "초대받은 분 확인" }),
    ).toContainText("친구들 모임");
    await expect(
      page.getByRole("radio", { name: "참석할게요", exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "응답 저장", exact: true }),
    ).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(writes).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`landing-${viewport.width}.png`),
      fullPage: true,
    });
  });
}

test("four steps keep identity, validate choices and permit final contact editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await invitePage(page);
  await page.getByRole("button", { name: /청첩장 받을 일정 정하기/ }).click();
  await expect(page.getByText("1 / 4", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "성함", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "배송지를 골라주세요" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "시/도" }).selectOption("서울");
  await page.getByRole("combobox", { name: "시/군/구" }).selectOption("강남구");
  await page.getByRole("button", { name: "다음", exact: true }).dblclick();
  await expect(page.getByText("2 / 4", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "배송 희망일을 선택해주세요 📅" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "13", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "시간대를 골라주세요" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "☀️ 오후", exact: true }).click();
  // A weekday cannot retain Sunday's afternoon slot.
  await page.getByRole("button", { name: "14", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "☀️ 오후", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "시간대를 골라주세요" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "🌙 저녁", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("3 / 4", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "주문 확인하기 🧾", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "방문할 사람을 선택해주세요" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /신랑 신랑이 갈게요/ }).click();
  await page
    .getByPlaceholder("요청사항을 적어주세요")
    .fill("도착 전에 알려주세요");
  await page
    .getByRole("button", { name: "주문 확인하기 🧾", exact: true })
    .click();
  await expect(page.getByText("4 / 4", { exact: true })).toBeVisible();
  await expect(
    page.getByText("테스트하객 · 010-****-5678", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("도착 전에 알려주세요", { exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([]);
  await page
    .getByRole("button", { name: "이름·연락처 수정", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "성함", exact: true })
    .fill("수정하객");
  await page
    .getByRole("button", { name: "다른 번호 입력", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "연락처", exact: true })
    .fill("010-9999-8888");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page
    .getByRole("button", { name: "주문 확인하기 🧾", exact: true })
    .click();
  await expect(
    page.getByText("수정하객 · 010-9999-8888", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(token));
  await page.screenshot({
    path: test.info().outputPath("summary-390.png"),
    fullPage: true,
  });
  expect(writes).toEqual([]);
});

async function selectSchedule(page: Page) {
  await page.getByRole("button", { name: /청첩장 받을 일정 정하기/ }).click();
  await page.getByRole("combobox", { name: "시/도" }).selectOption("서울");
  await page.getByRole("combobox", { name: "시/군/구" }).selectOption("강남구");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "14", exact: true }).click();
  await page.getByRole("button", { name: "🌙 저녁", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
}

test("admin cancellation refreshes the completed order and lets the same invite reorder", async ({ page }) => {
  test.skip(process.env.E2E_DB !== "1", "Configured client; all requests are mocked.");
  const writes = await invitePage(page);
  await page.route("**/api/delivery/manage?*", (route) =>
    route.fulfill({ json: { participant: { type: "직접배달", status: "취소" } } }));
  const submit = async () => {
    await selectSchedule(page);
    await page.getByRole("button", { name: /신랑 신랑이 갈게요/ }).click();
    await page.getByRole("button", { name: "주문 확인하기 🧾", exact: true }).click();
    await page.getByRole("button", { name: "네, 주문할게요 🛵", exact: true }).click();
    await expect(page.getByRole("link", { name: "신청 취소 / 변경 / 배송 현황 보기" })).toBeVisible();
  };
  await submit();
  expect(writes).toEqual(["order"]);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "기존 주문이 취소되었어요" })).toBeVisible();
  await page.getByRole("link", { name: "다시 신청하기", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(token));
  await submit();
  expect(writes).toEqual(["order", "order"]);
});

test("returning to a full page refreshes capacity after admin cancellation", async ({ page }) => {
  test.skip(process.env.E2E_DB !== "1", "Configured client; all requests are mocked.");
  await invitePage(page);
  let count = 10000;
  await page.route("**/rest/v1/rpc/get_delivery_guest_count", (route) => route.fulfill({ json: count }));
  await page.reload();
  await expect(page.getByRole("button", { name: /청첩장 받을 일정 정하기/ })).toHaveCount(0);
  count = 0;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: /청첩장 받을 일정 정하기/ })).toBeVisible();
});

test("final confirmation sends one personal order with invite identity", async ({
  page,
}) => {
  test.skip(
    process.env.E2E_DB !== "1",
    "Requires a configured-client build; all writes are mocked.",
  );
  const writes = await invitePage(page);
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/delivery/create", async (route) => {
    requests.push(route.request().postDataJSON());
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({
      json: { participant_id: "test-person", manage_token: "a".repeat(32) },
    });
  });
  await selectSchedule(page);
  await page.getByRole("button", { name: /신랑 신랑이 갈게요/ }).click();
  await page
    .getByRole("button", { name: "주문 확인하기 🧾", exact: true })
    .click();
  expect(requests).toEqual([]);
  await page
    .getByRole("button", { name: "네, 주문할게요 🛵", exact: true })
    .dblclick();
  await expect(
    page.getByRole("link", { name: "신청 취소 / 변경 / 배송 현황 보기" }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    inviteToken: token,
    groupSlug: null,
    name: "테스트하객",
    phone: null,
    date: "2026-09-14",
    time: "저녁",
    location: "서울 강남구",
  });
  expect(writes).toEqual([]);
});

test("declining a same-day join offer keeps the selected time and proceeds to rider", async ({
  page,
}) => {
  test.skip(
    process.env.E2E_DB !== "1",
    "Requires a configured-client build; all RPCs are mocked.",
  );
  const writes = await invitePage(page);
  await page.route("**/rest/v1/rpc/get_orders_on_date", (route) =>
    route.fulfill({
      json: [
        {
          id: "test-order",
          time_slot: "오후",
          member_count: 1,
          owner_masked: "다*분",
        },
      ],
    }),
  );
  await selectSchedule(page);
  await expect(
    page.getByRole("button", { name: "네, 합석할게요 🤝", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "아니요, 따로 받을게요", exact: true })
    .click();
  await expect(page.getByText("3 / 4", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /신랑 신랑이 갈게요/ }).click();
  await page
    .getByRole("button", { name: "주문 확인하기 🧾", exact: true })
    .click();
  await expect(
    page.getByText("9월 14일 (월) 저녁", { exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([]);
});
