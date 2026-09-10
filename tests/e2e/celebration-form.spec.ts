import { test, expect } from "@playwright/test";
const KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "ci-dummy-key";

for (const path of ["/", `/?key=${KEY}`]) {
  test(`메인 ${path}에서 이름과 메시지만으로 축하를 남긴다`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/rest/v1/**", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/admin/celebrations", (route) => route.fulfill({ status: 401, json: {} }));
    const writes: object[] = [];
    await page.route("**/api/celebrations", async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(path);
    const form = page.getByRole("form", { name: "축하 한마디 남기기" });
    await form.getByRole("textbox", { name: "이름", exact: true }).fill("홍길동");
    await form.getByRole("textbox", { name: "축하 한마디", exact: true }).fill("두 사람의 결혼을 축하해요!");
    await form.screenshot({ path: test.info().outputPath("celebration-form.png") });
    await form.getByRole("button", { name: "축하 남기기", exact: true }).click();
    await expect(form.getByRole("status")).toContainText("축하 한마디를 남겼어요");
    expect(writes).toEqual([{ name: "홍길동", message: "두 사람의 결혼을 축하해요!", visibility: "anon" }]);
    await expect(form.getByRole("textbox", { name: "축하 한마디", exact: true })).toHaveValue("");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("저장 실패 시 내용을 보존하고 비공개로 재시도한다", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/celebrations", (route) => {
    attempts++;
    expect(route.request().postDataJSON()).toMatchObject({ visibility: "private" });
    return route.fulfill({ status: attempts === 1 ? 503 : 200, json: { ok: attempts > 1 } });
  });
  await page.goto("/");
  const form = page.getByRole("form", { name: "축하 한마디 남기기" });
  await form.getByRole("textbox", { name: "이름", exact: true }).fill("홍길동");
  await form.getByRole("textbox", { name: "축하 한마디", exact: true }).fill("둘에게만 전해요");
  await form.getByRole("combobox", { name: "공개 방식" }).selectOption("private");
  await form.getByRole("button", { name: "축하 남기기", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("저장하지 못했어요");
  await expect(form.getByRole("textbox", { name: "축하 한마디", exact: true })).toHaveValue("둘에게만 전해요");
  await form.getByRole("button", { name: "축하 남기기", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("두 사람에게만 전했어요");
  expect(attempts).toBe(2);
});

test("공개 메시지 저장 후 피드가 즉시 갱신된다", async ({ page }) => {
  test.skip(process.env.E2E_DB !== "1", "Needs configured client; all requests mocked.");
  let saved = false;
  await page.route("**/rest/v1/rpc/get_celebrations", (route) => route.fulfill({ json: saved ? [{
    id: "test-heart", kind: "마음배송", name: "다정한 토끼", message: "새 축하 메시지", stamp: "💌", area: null,
    created_at: "2026-09-10", rating: null, reply: null,
  }] : [] }));
  await page.route("**/api/celebrations", (route) => { saved = true; return route.fulfill({ json: { ok: true } }); });
  await page.goto(`/?key=${KEY}`);
  const form = page.getByRole("form", { name: "축하 한마디 남기기" });
  await form.getByRole("textbox", { name: "이름", exact: true }).fill("홍길동");
  await form.getByRole("textbox", { name: "축하 한마디", exact: true }).fill("새 축하 메시지");
  await form.getByRole("button", { name: "축하 남기기", exact: true }).click();
  await expect(page.getByText("새 축하 메시지", { exact: true })).toBeVisible();
  await expect(page.getByText(/지금까지 1명이/)).toBeVisible();
});
