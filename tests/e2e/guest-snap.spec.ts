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

/**
 * 앨범 다중 선택 업로드.
 *
 * 업로드 API 는 요청당 한 장만 받고 토큰당 10분 30장 제한이 있어, 여러 장은
 * 한 장씩 차례로 올린다. 여기서 지키는 것은 그 과정에서 쉽게 깨지는 두 가지다:
 * 중간에 실패했을 때 (1) 이미 올라간 사진을 다시 올리지 않을 것,
 * (2) 몇 장이 올라갔는지 하객에게 알릴 것.
 *
 * 실제 Supabase 없이 검증하려고 업로드·토큰 API 를 가로챈다.
 */
type StubOpts = { failAt?: number[]; rateLimitAt?: number };

async function stubUploads(page: import("@playwright/test").Page, opts: StubOpts = {}) {
  const seen: number[] = [];
  await page.route("**/api/guest-photos/token*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", json: { token: "stub" } })
  );
  await page.route("**/api/guest-photos/direct", (route) =>
    route.fulfill({ status: 200, json: { storage: "supabase" } })
  );
  await page.route("**/api/guest-photos", (route) => {
    const n = seen.length + 1;
    seen.push(n);
    if (opts.rateLimitAt === n)
      return route.fulfill({
        status: 429,
        contentType: "application/json",
        json: { error: "너무 많이 올렸어요", code: "rate_limited" },
      });
    if (opts.failAt?.includes(n))
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        json: { error: "일부러 실패" },
      });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        photo: {
          id: `p${n}`,
          url: "/pic/gallery1.jpg",
          name: null,
          message: null,
          created_at: new Date().toISOString(),
        },
      },
    });
  });
  return { count: () => seen.length };
}

const THREE = [
  "public/pic/gallery1.jpg",
  "public/pic/gallery2.jpg",
  "public/pic/gallery3.jpg",
];

async function pickFromAlbum(page: import("@playwright/test").Page, files: string[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "앨범에서 고르기" }).click();
  const fc = await chooser;
  expect(fc.isMultiple()).toBe(true); // multiple 이 빠지면 한 장밖에 못 고른다
  await fc.setFiles(files);
  const modal = page.getByRole("dialog", { name: "사진 프레임 고르기" });
  await modal.waitFor({ state: "visible" });
  return modal;
}

test("앨범에서 여러 장을 고르면 장수가 표시되고 장별로 업로드된다", async ({ page }) => {
  const stub = await stubUploads(page);
  await page.goto(HOME);

  const modal = await pickFromAlbum(page, THREE);
  await expect(modal.getByText("3장", { exact: false }).first()).toBeVisible();

  await modal.getByRole("button", { name: "3장 이대로 올리기" }).click();
  // 전부 성공하면 모달이 닫힌다
  await expect(modal).toBeHidden({ timeout: 15_000 });
  expect(stub.count()).toBe(3); // 요청당 한 장 — 3장이면 3회
});

test("일부만 실패하면 성공한 사진은 다시 올리지 않는다", async ({ page }) => {
  const stub = await stubUploads(page, { failAt: [2] });
  await page.goto(HOME);

  const modal = await pickFromAlbum(page, THREE);
  await modal.getByRole("button", { name: "3장 이대로 올리기" }).click();

  // 안내는 반드시 모달 "안"에 있어야 한다 — 섹션 쪽에만 두면 검은 오버레이에
  // 가려 하객 눈에는 안 보인다 (CSS 로는 visible 이라 테스트만 통과하는 함정)
  await expect(modal.getByText(/3장 중 2장을 올렸어요/)).toBeVisible({
    timeout: 15_000,
  });
  expect(stub.count()).toBe(3);
  // 실패한 한 장만 남아 모달이 열려 있어야 한다
  await expect(modal).toBeVisible();

  const before = stub.count();
  await modal.getByRole("button", { name: "이대로 올리기", exact: true }).click();
  await expect(modal).toBeHidden({ timeout: 15_000 });
  // 재시도는 남은 1장만 — 이미 올라간 2장이 또 올라가면 방명록에 중복으로 쌓인다
  expect(stub.count() - before).toBe(1);
});

test("업로드 한도에 걸리면 남은 사진을 더 시도하지 않는다", async ({ page }) => {
  const stub = await stubUploads(page, { rateLimitAt: 2 });
  await page.goto(HOME);

  const modal = await pickFromAlbum(page, THREE);
  await modal.getByRole("button", { name: "3장 이대로 올리기" }).click();

  await expect(modal.getByText(/3장 중 1장을 올렸어요/)).toBeVisible({
    timeout: 15_000,
  });
  // 2번째에서 한도 → 3번째는 보내지 않는다 (보내봐야 똑같이 막힌다)
  expect(stub.count()).toBe(2);
});

test("한 번에 올릴 수 있는 장수를 넘기면 잘라내되 그 사실을 알린다", async ({
  page,
}) => {
  await stubUploads(page);
  await page.goto(HOME);

  // 상한(10장)보다 많이 고른 상황
  const many = Array.from(
    { length: 12 },
    (_, i) => `public/pic/gallery${(i % 3) + 1}.jpg`
  );
  const modal = await pickFromAlbum(page, many);

  await expect(
    modal.getByRole("button", { name: "10장 이대로 올리기" })
  ).toBeVisible();
  // 말없이 사라지면 하객은 12장을 다 올린 줄 안다
  await expect(modal.getByText(/한 번에 10장까지 올릴 수 있어요/)).toBeVisible();
});

test("NAS 모드에서는 사진 본문을 NAS로 직접 보내고 JSON으로 등록한다", async ({ page }) => {
  let uploads = 0;
  let completions = 0;
  let legacy = 0;
  const nasUrl = 'https://nas.example.invalid/photos/snap/9a2c06ad-3f9f-49a3-9a29-1f95c5c31d83.jpg';
  await page.route('**/api/guest-photos/token*', route => route.fulfill({ json: { token: 'stub' } }));
  await page.route('**/api/guest-photos', route => { legacy++; return route.fulfill({ status: 500 }); });
  await page.route('**/api/guest-photos/direct', async route => {
    expect(route.request().headers()['content-type']).toContain('application/json');
    const body = route.request().postDataJSON();
    if (body.action === 'prepare') {
      expect(body.size).toBeGreaterThan(0);
      expect(body.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(body.file).toBeUndefined();
      return route.fulfill({ json: { storage: 'nas', uploadUrl: nasUrl, ticket: 'test-ticket' } });
    }
    expect(body.action).toBe('complete');
    expect(body.receipt).toBe('test-receipt');
    completions++;
    return route.fulfill({ json: { photo: { id: 'nas-photo', url: '/pic/gallery1.jpg', name: null, message: null, created_at: new Date().toISOString() } } });
  });
  await page.route(nasUrl, route => {
    const headers = { 'Access-Control-Allow-Origin': new URL(page.url()).origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'PUT, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    expect(route.request().method()).toBe('PUT');
    expect(route.request().headers().authorization).toBe('Bearer test-ticket');
    expect(route.request().postDataBuffer()!.length).toBeGreaterThan(0);
    uploads++;
    return route.fulfill({ headers, json: { receipt: 'test-receipt' } });
  });
  await page.goto(HOME);
  const modal = await pickFromAlbum(page, [THREE[0]]);
  await modal.getByRole('button', { name: '이대로 올리기', exact: true }).click();
  await expect(modal).toBeHidden({ timeout: 15_000 });
  expect(uploads).toBe(1);
  expect(completions).toBe(1);
  expect(legacy).toBe(0);
});
