import { test, expect } from "@playwright/test";
import { accounts, parkingLot, venue } from "../../src/lib/wedding";

const GUIDE_TOKEN = "a".repeat(32);
const GUIDE_URL = `/guest-guide?t=${GUIDE_TOKEN}`;
const CONFIRMED_AT = "2026-10-17T00:00:00Z";

for (const width of [320, 390]) test(`guest reads the guide before confirming and stays on it at ${width}px`, async ({ page, context }) => {
  await page.setViewportSize({ width, height: 850 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text: string) => { Reflect.set(window, "copiedAccount", text); },
    } });
  });
  await context.route("https://map.naver.com/**", route => route.fulfill({ contentType: "text/html", body: "<main>지도</main>" }));
  let confirmed = 0;
  await page.route("**/api/guest-guide", async route => {
    const body = route.request().postDataJSON();
    expect(body.token).toBe(GUIDE_TOKEN);
    if (body.action === "load") await route.fulfill({ json: { name: "테스트하객", confirmedAt: null, open: true } });
    else { confirmed++; await route.fulfill({ json: { confirmedAt: CONFIRMED_AT, nextUrl: "/?key=test-guide-key" } }); }
  });
  await page.goto(GUIDE_URL);
  await expect(page.getByRole("heading", { name: "예식 전 안내 확인" })).toBeVisible();
  await expect(page.getByText("테스트하객", { exact: true })).toBeVisible();
  await expect(page.getByText("현장 축의대는 운영하지 않습니다.", { exact: false })).toBeVisible();
  await expect(page.locator("article").filter({ has: page.getByRole("heading", { name: `${venue.name} 야외예식장`, exact: true }) }).getByText(/가급적 대중교통 이용을 권장드립니다/)).toBeVisible();
  await expect(page.getByRole("heading", { name: `${venue.name} 야외예식장`, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: parkingLot.name, exact: true })).toBeVisible();
  const confirmButton = page.getByRole("button", { name: "안내 확인했어요", exact: true });
  const button = await confirmButton.elementHandle();
  for (const account of accounts) {
    const number = page.getByText(account.number, { exact: true });
    await expect(number).toBeVisible();
    expect(await number.evaluate((element, button) => !!(element.compareDocumentPosition(button!) & Node.DOCUMENT_POSITION_FOLLOWING), button)).toBe(true);
    await page.getByRole("button", { name: `${account.name} 계좌번호 복사` }).click();
    expect(await page.evaluate(() => Reflect.get(window, "copiedAccount"))).toBe(account.number);
  }
  const walkingMap = page.getByRole("link", { name: "네이버 도보 길찾기", exact: true });
  await expect(walkingMap).toHaveAttribute("href", parkingLot.walkNav.naverWeb);
  expect(await walkingMap.evaluate((element, button) => !!(element.compareDocumentPosition(button!) & Node.DOCUMENT_POSITION_FOLLOWING), button)).toBe(true);
  await expect(page.getByRole("link", { name: "카카오맵 예식장 위치 보기", exact: true })).toHaveAttribute("href", venue.nav.kakaoWeb);
  await expect(page.getByRole("link", { name: "주차장 위치 보기", exact: true })).toHaveAttribute("href", parkingLot.nav.naverWeb);
  const popupPromise = page.waitForEvent("popup");
  await walkingMap.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  await popup.close();
  expect(confirmed).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("guest-guide.png"), fullPage: true });
  await confirmButton.click();
  await expect(page.getByRole("status").filter({ hasText: "안내 확인을 완료했어요." })).toBeVisible();
  await expect(page.getByRole("button", { name: "안내 확인 완료", exact: true })).toBeDisabled();
  await expect(page).toHaveURL(GUIDE_URL);
  expect(confirmed).toBe(1);
  const photos = page.getByRole("link", { name: /사진|청첩장/ });
  await expect(photos).toHaveAttribute("href", "/?view=photos");
  await photos.click();
  await expect(page).toHaveURL(/view=photos/);
  await expect(page.getByAltText(/웨딩 사진/)).toBeVisible();
  expect(new URL(page.url()).searchParams.has("t")).toBe(false);
  expect(confirmed).toBe(1);
});

test("before opening the guest sees the opening notice without private guide contents", async ({ page }) => {
  let confirmed = 0;
  await page.route("**/api/guest-guide", route => {
    if (route.request().postDataJSON().action === "confirm") confirmed++;
    return route.fulfill({ json: { name: "테스트하객", confirmedAt: null, open: false } });
  });
  await page.goto(GUIDE_URL);
  await expect(page.getByRole("button", { name: "안내 확인했어요", exact: true })).toBeDisabled();
  await expect(page.getByText("10월 15일 0시부터 사전 안내를 확인하실 수 있습니다.")).toBeVisible();
  for (const account of accounts) await expect(page.getByText(account.number, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "네이버 도보 길찾기", exact: true })).toHaveCount(0);
  expect(confirmed).toBe(0);
});

test("a returning guest can read the guide without recording confirmation again", async ({ page }) => {
  let confirmed = 0;
  await page.route("**/api/guest-guide", route => {
    if (route.request().postDataJSON().action === "confirm") confirmed++;
    return route.fulfill({ json: { name: "테스트하객", confirmedAt: CONFIRMED_AT, open: true } });
  });
  await page.goto(GUIDE_URL);
  await expect(page.getByRole("button", { name: "안내 확인 완료", exact: true })).toBeDisabled();
  await expect(page.getByRole("status").filter({ hasText: "안내 확인을 완료했어요." })).toBeVisible();
  await expect(page.getByText(accounts[0].number, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "안내 확인 완료", exact: true })).toBeDisabled();
  expect(confirmed).toBe(0);
});

test("a failed confirmation leaves the guide readable and can be retried", async ({ page }) => {
  let confirmed = 0;
  await page.route("**/api/guest-guide", async route => {
    if (route.request().postDataJSON().action === "load") return route.fulfill({ json: { name: "테스트하객", confirmedAt: null, open: true } });
    confirmed++;
    if (confirmed === 1) return route.fulfill({ status: 503, json: { error: "확인 기록을 저장하지 못했습니다." } });
    await route.fulfill({ json: { confirmedAt: CONFIRMED_AT, nextUrl: "/?key=test-guide-key" } });
  });
  await page.goto(GUIDE_URL);
  const button = page.getByRole("button", { name: "안내 확인했어요", exact: true });
  await button.click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("확인 기록을 저장하지 못했습니다.");
  await expect(page.getByText(accounts[0].number, { exact: true })).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(page).toHaveURL(GUIDE_URL);
  await button.click();
  await expect(page.getByRole("button", { name: "안내 확인 완료", exact: true })).toBeDisabled();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  expect(confirmed).toBe(2);
});

for (const width of [320,390,1280]) test(`admin reviews attendees and messages before SMS submission at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); let sent=0;
  const recipient = { id: "r1", name: "테스트하객", side: "groom", phoneMasked: "010-****-2222", canSms: true, confirmedAt: null, smsStatus: null, smsSentAt: null };
  await page.route("**/api/admin/**", async route => {
    const path = new URL(route.request().url()).pathname; let json: object = {};
    if (path==="/api/admin/login") json={ok:true};
    if (path==="/api/admin/groups") json={groups:[],total_members:0};
    if (path==="/api/admin/deliveries") json={deliveries:[]};
    if (path==="/api/admin/guest-guide") {
      if (route.request().method()==="GET") json={recipients:[recipient],smsReady:true};
      else if (route.request().postDataJSON().action==="prepare") json={recipients:[{...recipient,url:"https://example.invalid/guest-guide?t=personal-link",message:"테스트하객님, 안내를 읽으신 뒤 ‘안내 확인했어요’를 눌러주세요. https://example.invalid/guest-guide?t=personal-link",reviewToken:"review"}]};
      else { sent++; json={id:"r1",status:"accepted"}; }
    }
    await route.fulfill({json});
  });
  await page.goto("/admin");
  await expect(page.getByRole("heading",{name:"캘린더",exact:true})).toBeVisible();
  if(width<1024)await page.getByRole("button",{name:"메뉴 열기"}).click();
  await page.getByRole("button",{name:"사전 안내",exact:true}).click();
  await page.getByRole("button",{name:"미발송·미확인 참석자 선택"}).click();
  await page.getByRole("button",{name:"선택 1명 문구·개인 링크 확인"}).click();
  const button=page.getByRole("button",{name:"선택 1명에게 문자 발송"});
  await expect(button).toBeDisabled(); expect(sent).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath("admin-guide.png"),fullPage:true});
  await page.getByRole("checkbox",{name:"선택한 하객과 문구를 확인했습니다.",exact:false}).check();
  await button.click();
  await expect(page.getByText("1명 문자 발송 접수 완료.",{exact:false})).toBeVisible(); expect(sent).toBe(1);
});
