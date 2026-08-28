import { test, expect } from "@playwright/test";

/**
 * DB 가 있어야 하는 E2E (E2E-2·3·5·6) — 로컬/CI Supabase 스택 + 시드가 준비되고
 * E2E_DB=1 일 때만 실행된다. 운영 Supabase 에는 절대 연결하지 말 것.
 *
 * 준비물(수동/CI 스크립트):
 *  - supabase local (docker) + 레거시 db/*.sql → supabase/migrations 순서 적용
 *  - 시드: 그룹 1개(slug=e2e-group) + group_member 1명(invite 토큰=E2E_INVITE_TOKEN)
 *  - 앱 env: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + SUPABASE_SERVICE_ROLE_KEY(local),
 *            ADMIN_PASSWORD=e2e-admin-pass
 */
const DB = Boolean(process.env.E2E_DB);
const INVITE_TOKEN = process.env.E2E_INVITE_TOKEN ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-pass";

test.describe("E2E-2 개인 초대", () => {
  test.skip(!DB || !INVITE_TOKEN, "E2E_DB + 시드 필요");

  test("초대 링크 진입 시 이름·마스킹 번호만 보이고 실제 번호는 노출되지 않는다", async ({ page }) => {
    await page.goto(`/delivery/group/e2e-group?i=${INVITE_TOKEN}`);
    await expect(page.getByText(/010-\*\*\*\*-\d{4}/)).toBeVisible();
    const html = await page.content();
    expect(html).not.toMatch(/010-\d{4}-\d{4}/); // 전체 번호가 HTML 어디에도 없어야 함
  });

  test("초대 해석 API 는 마스킹 번호만 반환한다", async ({ request }) => {
    const res = await request.get(`/api/delivery/invite?i=${INVITE_TOKEN}`);
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.invite.phoneMasked).toMatch(/^010-\*\*\*\*-\d{4}$/);
    expect(JSON.stringify(j)).not.toMatch(/010-\d{4}-\d{4}/);
  });

  test("초대 토큰과 다른 그룹 조합은 403 invite_group_mismatch", async ({ request }) => {
    const res = await request.post("/api/delivery/group/accept", {
      data: { slug: "some-other-group", name: "홍길동", inviteToken: INVITE_TOKEN },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("invite_group_mismatch");
  });
});

test.describe("E2E-3/4 배송 신청 + manage token", () => {
  test.skip(!DB, "E2E_DB 필요");

  test("신규 배송 신청 → manage token 발급 → 관리 페이지 접근", async ({ request, page }) => {
    const res = await request.post("/api/delivery/create", {
      data: {
        name: "E2E테스터",
        phone: "010-9999-1234",
        location: "서울 강남구 테스트로 1",
        date: "2026-10-10", // 주말 (전 시간대 허용)
        time: "오후",
        message: null,
      },
    });
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.manage_token).toMatch(/^[0-9a-f]{32}$/);

    await page.goto(`/delivery/manage/${j.manage_token}`);
    await expect(page.getByText("E2E테스터")).toBeVisible();
  });

  test("변조 manage token → 401", async ({ request }) => {
    const res = await request.get(
      "/api/delivery/manage?t=00000000000000000000000000000000"
    );
    expect(res.status()).toBe(401);
  });
});

test.describe("E2E-5 관리자 세션", () => {
  test.skip(!DB, "E2E_DB 필요");

  test("잘못된 비밀번호 → 401, 정상 → 로그인·유지·로그아웃 후 차단", async ({ request }) => {
    const bad = await request.post("/api/admin/login", {
      data: { password: "wrong-password" },
    });
    expect(bad.status()).toBe(401);

    const ok = await request.post("/api/admin/login", {
      data: { password: ADMIN_PASSWORD },
    });
    expect(ok.status()).toBe(200);

    // 세션 쿠키로 보호 API 접근 (request context 가 쿠키 유지)
    const stats = await request.get("/api/admin/stats");
    expect(stats.status()).toBe(200);

    const out = await request.post("/api/admin/login", { data: { logout: true } });
    expect(out.ok()).toBeTruthy();
    const after = await request.get("/api/admin/stats");
    expect(after.status()).toBe(401);
  });
});

test.describe("E2E-6 체크인 운영 시간", () => {
  test.skip(!DB, "E2E_DB 필요");

  test("checkin disabled 상태에서는 공용 검색이 차단된다", async ({ request }) => {
    const res = await request.post("/api/checkin/search", {
      data: { eventKey: process.env.E2E_CHECKIN_EVENT_KEY ?? "", name: "홍길동", last4: "1234" },
    });
    // 이벤트 키 미설정이면 503, 설정 + disabled 면 결과 코드로 차단
    expect(res.ok()).toBeFalsy();
  });
});
