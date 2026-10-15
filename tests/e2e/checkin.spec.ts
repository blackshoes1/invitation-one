import { test, expect } from "@playwright/test";

for (const url of ["/checkin", "/checkin?t=123e4567-e89b-42d3-a456-426614174000", "/checkin?event=old-event", "/checkin-qr"]) {
  test(`기존 체크인 주소는 예식 안내만 표시한다: ${url}`, async ({ page }) => {
    let requests = 0;
    page.on("request", req => { if (/\/api\/(checkin|identity)\//.test(new URL(req.url()).pathname)) requests++; });
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "예식 안내", exact: true })).toBeVisible();
    await expect(page.getByText("예식 당일 별도의 온라인 체크인은 진행하지 않습니다.", { exact: false })).toBeVisible();
    await expect(page.getByRole("link", { name: "예식 안내 보기" })).toHaveAttribute("href", "/");
    await expect(page.locator("input")).toHaveCount(0);
    await expect(page.getByRole("button")).toHaveCount(0);
    expect(requests).toBe(0);
  });
}

test("기존 개인·공용 체크인 API는 종료 상태이며 개인정보를 반환하지 않는다", async ({ request }) => {
  const responses = await Promise.all([
    request.get("/api/checkin/pass?t=123e4567-e89b-42d3-a456-426614174000"),
    request.post("/api/checkin/pass", { data: { token: "123e4567-e89b-42d3-a456-426614174000", actualPartySize: 2 } }),
    request.post("/api/checkin/common", { data: { eventKey: "old-event", rsvpId: "old-rsvp", actualPartySize: 2 } }),
    request.post("/api/checkin/search", { data: { eventKey: "old-event", verificationToken: "a".repeat(32) } }),
  ]);
  for (const res of responses) {
    expect(res.status()).toBe(410);
    expect(await res.json()).toEqual({ error: "self_checkin_disabled", result: "self_checkin_disabled" });
    expect(res.headers()["cache-control"]).toContain("no-store");
  }
});

test("기존 체크인 페이지는 검색엔진 색인이 차단된다", async ({ page }) => {
  await page.goto("/checkin");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
