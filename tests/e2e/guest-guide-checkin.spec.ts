import { test, expect } from "@playwright/test";

for (const width of [320,390]) test(`guest confirms explicitly before moving to the invitation at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 }); let confirmed = 0;
  await page.route("**/api/guest-guide", async route => {
    if (route.request().postDataJSON().action === "load") await route.fulfill({ json: { name: "테스트하객", confirmedAt: null, open: true } });
    else { confirmed++; await route.fulfill({ json: { confirmedAt: "2026-10-15T00:00:00Z", nextUrl: "/?key=test-guide-key" } }); }
  });
  await page.route("**/?key=test-guide-key", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: "<main>새 안내 청첩장</main>" }));
  await page.goto(`/guest-guide?t=${"a".repeat(32)}`);
  await expect(page.getByRole("heading", { name: "예식 전 안내 확인" })).toBeVisible();
  expect(confirmed).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("guest-checkin.png"), fullPage: true });
  await page.getByRole("button", { name: "사전 안내 체크인하고 안내 보기" }).click();
  await expect(page.getByText("새 안내 청첩장")).toBeVisible(); expect(confirmed).toBe(1);
  expect(page.url()).not.toContain("t=");
});

test("before October 15 the guest can see the opening notice but cannot record confirmation", async ({ page }) => {
  await page.route("**/api/guest-guide", route => route.fulfill({ json: { name: "테스트하객", confirmedAt: null, open: false } }));
  await page.goto(`/guest-guide?t=${"a".repeat(32)}`);
  await expect(page.getByRole("button", { name: "사전 안내 체크인하고 안내 보기" })).toBeDisabled();
  await expect(page.getByText("10월 15일 0시부터 사전 안내를 확인하실 수 있습니다.")).toBeVisible();
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
      else if (route.request().postDataJSON().action==="prepare") json={recipients:[{...recipient,url:"https://example.invalid/guest-guide?t=personal-link",message:"테스트하객님, 10월 15일부터 개인 주소에서 안내를 확인해주세요. https://example.invalid/guest-guide?t=personal-link",reviewToken:"review"}]};
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
