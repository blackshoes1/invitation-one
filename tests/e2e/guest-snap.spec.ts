import { test, expect } from "@playwright/test";

/**
 * 하객 스냅 업로드 진입 경로.
 *
 * 지키려는 것: 휴대폰에서 "앨범에서 고르기" 가 실제로 사진 보관함을 열어야 한다.
 * file input 에 capture 속성이 붙으면 휴대폰은 카메라를 바로 열고 앨범 선택지를
 * 아예 없애버린다 — 화면에는 버튼이 그대로 보이므로 눈으로는 알아채기 어렵다.
 */
const KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "ci-dummy-key";
const HOME = `/?key=${encodeURIComponent(KEY)}`;

test("찍기와 앨범 고르기 두 경로가 모두 있다", async ({ page }) => {
  await page.goto(HOME);
  await expect(page.getByRole("button", { name: "지금 찍기" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "앨범에서 고르기" })
  ).toBeVisible();
});

test("앨범 버튼이 여는 input 에는 capture 가 없다 (사진 보관함이 열려야 한다)", async ({
  page,
}) => {
  await page.goto(HOME);

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "앨범에서 고르기" }).click();
  const picked = (await chooser).element();

  expect(await picked.getAttribute("capture")).toBeNull();
  expect(await picked.getAttribute("accept")).toBe("image/*");
});

test("촬영 버튼이 여는 input 은 카메라를 바로 연다", async ({ page }) => {
  await page.goto(HOME);

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "지금 찍기" }).click();
  const picked = (await chooser).element();

  expect(await picked.getAttribute("capture")).toBe("environment");
});

test("앨범에서 고른 사진도 프레임 고르기 단계로 이어진다", async ({ page }) => {
  await page.goto(HOME);

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "앨범에서 고르기" }).click();
  await (await chooser).setFiles("public/pic/gallery1.jpg");

  const modal = page.getByRole("dialog", { name: "사진 프레임 고르기" });
  await expect(modal).toBeVisible();
  // 프레임을 입힌 미리보기가 실제로 그려져야 한다 (canvas 합성 실패 시 안 보인다)
  await expect(modal.getByAltText("미리보기")).toBeVisible();
});
