import { test, expect } from "@playwright/test";
import { GUEST_GUIDE_START } from "../../src/lib/wedding";

/**
 * E2E-1 청첩장 접근 (invitation key 게이트)
 * NEXT_PUBLIC_INVITATION_KEY 는 빌드 타임 상수 — 빌드와 같은 값을 써야 한다.
 */
const KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "ci-dummy-key";
// page.tsx 와 같은 조건 — 미리보기 배포이거나 10월 15일 0시(KST) 이후면 하객 안내가 먼저 열린다
const GUIDE_ACTIVE = process.env.VERCEL_ENV === "preview" || Date.now() >= GUEST_GUIDE_START.getTime();

// 하객 안내 공개 이후엔 키 없이도 안내가 열리므로, 잠금은 사진 청첩장(view=photos)에서 본다.
// 공개 전에는 view 와 상관없이 잠금이라 같은 주소로 날짜와 무관하게 확인된다.
const LOCKED = "/?view=photos";

test("키 없이 접근하면 기본 정보와 공개 축하 지도 영역이 보인다", async ({ page }) => {
  await page.goto(LOCKED);
  await expect(page.getByText("아직 공개 전이에요")).toBeVisible();
  // 본문(웨딩 사진 히어로)은 렌더되지 않는다
  await expect(page.getByAltText(/웨딩 사진/)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "우리를 축하해준 사람들" })).toBeVisible();
  await expect(page.getByRole("button", { name: "💬 메시지", exact: true })).toHaveCount(0);
});

test("잘못된 키로 접근하면 잠금 화면이 보인다", async ({ page }) => {
  await page.goto("/?key=totally-wrong-key&view=photos");
  await expect(page.getByText("아직 공개 전이에요")).toBeVisible();
});

test("정상 키로 접근하면 공개 일정에 맞는 청첩장이 열린다", async ({ page }) => {
  await page.goto(`/?key=${encodeURIComponent(KEY)}`);
  if (GUIDE_ACTIVE) {
    await expect(page.getByRole("link", { name: "축의금 계좌 안내", exact: true })).toBeVisible();
    await expect(page.getByAltText(/웨딩 사진/)).toHaveCount(0);
    await page.getByRole("link", { name: "모바일 청첩장 보러가기", exact: true }).click();
    await expect(page).toHaveURL(/view=photos/);
  }
  await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();
  await expect(page.getByText("아직 공개 전이에요")).toHaveCount(0);
});

test("한 번 열어본 기기는 키 없이 다시 들어와도 열린다", async ({ page }) => {
  await page.goto(`/?key=${encodeURIComponent(KEY)}`);
  await expect(page.getByRole("button", { name: "작은 글씨로 보기" })).toBeVisible();
  // 링크를 잃어버리고 주소만 다시 여는 상황
  await page.goto("/");
  await expect(page.getByText("아직 공개 전이에요")).toHaveCount(0);
  if (GUIDE_ACTIVE) {
    await expect(page.getByRole("link", { name: "축의금 계좌 안내", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "모바일 청첩장 보러가기", exact: true }).click();
    await expect(page).toHaveURL(/view=photos/);
  }
  await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();
});

test("잠금 화면에서 '내 신청 찾기'로 복구할 수 있다", async ({ page }) => {
  await page.goto(LOCKED);
  await page.getByRole("link", { name: /내 신청 찾기/ }).click();
  await expect(page).toHaveURL(/\/delivery\?find=1/);
  // 찾기 폼이 접힌 상태가 아니라 바로 열려 있어야 한다
  await expect(page.getByPlaceholder("연락처 끝 4자리")).toBeVisible();
});
