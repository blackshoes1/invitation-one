import { test, expect } from "@playwright/test";

/**
 * 배송지는 **고르는 것**이지 쓰는 것이 아니다.
 *
 * 자유 입력이던 시절 운영 데이터에 이런 값들이 들어왔다:
 * "갱냄", "ㅎㅇ", "아무데나쥬어옹", "근영이형집". 신랑신부가 이걸로 배달 동선을
 * 짤 수 없다. 안내 문구는 원래부터 "시·군·구까지만"이었으므로, 묻는 방식을
 * 그 문구에 맞춘 것이다.
 *
 * 해외는 고를 수 없어야 한다 — 직접 배달을 갈 수 없는 곳을 신청받으면 안 된다.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function toLocationStep(page: import("@playwright/test").Page) {
  await page.goto("/delivery");
  await page.getByRole("button", { name: /청첩장 받을 일정 정하기/ }).click();
  await page.getByRole("textbox", { name: "성함", exact: true }).fill("홍길동");
  await page.getByRole("textbox", { name: "연락처" }).fill("010-1234-5678");
  await expect(page.getByText("어디로 배달할까요?")).toBeVisible();
}

test("배송지는 시/도 → 시/군/구 선택이다 (자유 입력 없음)", async ({ page }) => {
  await toLocationStep(page);

  // 텍스트로 아무거나 적어 넣을 자리가 없어야 한다
  await expect(page.getByRole("textbox", { name: /배송지|주소/ })).toHaveCount(0);

  const sido = page.getByRole("combobox", { name: "시/도" });
  const gu = page.getByRole("combobox", { name: "시/군/구" });
  await expect(gu).toBeDisabled(); // 시/도를 고르기 전에는 못 고른다

  await sido.selectOption("서울");
  await gu.selectOption("강동구");

  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("어디로 배달할까요?")).toHaveCount(0); // 다음 단계로 넘어갔다
});

test("시/군/구를 안 고르면 넘어가지 않는다", async ({ page }) => {
  await toLocationStep(page);
  await page.getByRole("combobox", { name: "시/도" }).selectOption("서울");
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText("배송지를 골라주세요 📍")).toBeVisible();
});

test("해외는 고를 수 없다 — 직접 배달을 갈 수 없는 곳이다", async ({ page }) => {
  await toLocationStep(page);
  const options = await page
    .getByRole("combobox", { name: "시/도" })
    .locator("option")
    .allTextContents();
  expect(options.some((o) => o.includes("해외"))).toBe(false);
  expect(options).toContain("서울"); // 국내는 그대로 있다
});
