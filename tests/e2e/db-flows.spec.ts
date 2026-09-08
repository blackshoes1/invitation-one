import { test, expect } from "@playwright/test";

/**
 * DB 가 있어야 하는 E2E (E2E-2·3·5·6) — 로컬/CI Supabase 스택 + 시드가 준비되고
 * E2E_DB=1 일 때만 실행된다. 운영 Supabase 에는 절대 연결하지 말 것.
 *
 * 준비는 scripts/e2e-db-ci.sh 가 수행:
 *  - supabase start (레거시 db/*.sql 을 타임스탬프 마이그레이션으로 복사해 순서 적용)
 *  - 시드: 그룹(slug=e2e-group, 'E2E그룹') + group_member '초대손님'
 *          (phone 010-9876-5432, invite 토큰 = E2E_INVITE_TOKEN)
 *  - 앱 env: 로컬 Supabase 키 + ADMIN_PASSWORD + CHECKIN_EVENT_KEY
 */
const DB = Boolean(process.env.E2E_DB);
const INVITE_TOKEN = process.env.E2E_INVITE_TOKEN ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-pass";
const EVENT_KEY = process.env.E2E_CHECKIN_EVENT_KEY ?? "";

test.describe("E2E-2 개인 초대", () => {
  test.skip(!DB || !INVITE_TOKEN, "E2E_DB + 시드 필요");

  test("초대 링크 진입 — 페이지 어디에도 전체 전화번호가 노출되지 않는다", async ({ page }) => {
    await page.goto(`/delivery/group/e2e-group?i=${INVITE_TOKEN}`);
    await expect(page.getByText("E2E그룹")).toBeVisible();
    // 초대 해석(fetch) 완료 후에도 전체 번호는 HTML 에 없어야 한다 (마스킹만)
    await page.waitForLoadState("networkidle");
    const html = await page.content();
    expect(html).not.toMatch(/010-\d{3,4}-\d{4}/);
  });

  test("개인 링크로 들어오면 묻지 않고 이름을 부르며 확인만 받는다", async ({ page }) => {
    // 이미 아는 정보를 "알려주세요"라고 묻지 않는다 — 초대 링크의 목적이
    // 다시 입력하는 번거로움을 없애는 것이므로 첫 화면부터 그게 드러나야 한다.
    await page.goto(`/delivery?i=${INVITE_TOKEN}`);

    await expect(page.getByRole("heading", { name: "초대손님님, 반가워요 👋" })).toBeVisible();
    await expect(page.getByText("받는 분 정보를 알려주세요")).toHaveCount(0);
    // 번호는 마스킹만 — 실제 번호는 제출 시 서버가 토큰으로 채운다
    await expect(page.getByText("010-****-5432")).toBeVisible();
    await expect(page.getByText("초대 링크로 확인됨")).toBeVisible();

    await page.waitForLoadState("networkidle");
    expect(await page.content()).not.toMatch(/010-\d{3,4}-\d{4}/);
  });

  test("'정보 수정'을 누르면 직접 입력할 수 있다 (명단 이름이 틀릴 수 있으므로)", async ({
    page,
  }) => {
    await page.goto(`/delivery?i=${INVITE_TOKEN}`);
    await page.getByRole("button", { name: "정보 수정" }).click();

    // 이름 칸은 초대값이 채워진 채로 열린다 — 지우고 고칠 수 있다
    await expect(page.getByLabel("성함")).toHaveValue("초대손님");
    // 번호는 여전히 마스킹 확인 박스 + "다른 번호 입력" 경로
    // (눌러도 inviteToken 은 계속 전송되어 명단 연결이 유지된다 — 결함 ①)
    await expect(page.getByRole("button", { name: "다른 번호 입력" })).toBeVisible();
    expect(await page.content()).not.toMatch(/010-\d{3,4}-\d{4}/);
  });

  test("초대 없이 들어오면 화면이 그대로다", async ({ page }) => {
    await page.goto("/delivery");
    await page.getByRole("button", { name: /종이 청첩장 직접 받기/ }).click();
    await expect(page.getByText("받는 분 정보를 알려주세요")).toBeVisible();
  });

  test("초대 해석 API 는 이름 + 마스킹 번호만 반환한다", async ({ request }) => {
    const res = await request.get(`/api/delivery/invite?i=${INVITE_TOKEN}`);
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.invite.name).toBe("초대손님");
    expect(j.invite.phoneMasked).toBe("010-****-5432");
    expect(j.invite.groupSlug).toBe("e2e-group");
    expect(JSON.stringify(j)).not.toMatch(/010-\d{3,4}-\d{4}/);
  });

  test("초대 토큰과 다른 그룹 조합은 403 invite_group_mismatch", async ({ request }) => {
    const res = await request.post("/api/delivery/group/accept", {
      data: { slug: "some-other-group", name: "홍길동", inviteToken: INVITE_TOKEN },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("invite_group_mismatch");
  });

  test("존재하지 않는 초대 토큰은 401", async ({ request }) => {
    const res = await request.post("/api/delivery/join", {
      data: {
        deliveryId: "123e4567-e89b-42d3-a456-426614174000",
        name: "홍길동",
        inviteToken: "ffffffffffffffffffffffffffffffff",
      },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe("invite_invalid");
  });
});

test.describe("E2E-3/4 배송 신청 + manage token", () => {
  test.skip(!DB, "E2E_DB 필요");

  test("신규 배송 신청 → manage token 발급 → 관리 페이지 접근", async ({ request, page }) => {
    // 주말 후보 날짜 — 재시도(retry)로 이미 점유됐으면 다음 날짜 사용.
    // 평일을 쓰면 안 된다: slotsForDate() 가 평일엔 점심·저녁만 허용해 '오후' 는 400.
    const dates = ["2026-10-10", "2026-10-11", "2026-10-03", "2026-10-04"];
    let token: string | null = null;
    for (const date of dates) {
      const res = await request.post("/api/delivery/create", {
        data: {
          name: "E2E테스터",
          phone: "010-9999-1234",
          location: "서울 강남구 테스트로 1",
          date,
          time: "오후",
          message: null,
        },
      });
      if (res.status() === 200) {
        token = (await res.json()).manage_token;
        break;
      }
      expect(res.status()).toBe(409); // date_taken 만 허용
    }
    expect(token).toMatch(/^[0-9a-f]{32}$/);

    await page.goto(`/delivery/manage/${token}`);
    await expect(page.getByText("E2E테스터").first()).toBeVisible();
  });

  test("변조 manage token → 401, participant 데이터 비반환", async ({ request }) => {
    const res = await request.get(
      "/api/delivery/manage?t=00000000000000000000000000000000"
    );
    expect(res.status()).toBe(401);
    expect((await res.json()).participant).toBeUndefined();
  });
});

test.describe("E2E-5 관리자 세션", () => {
  test.skip(!DB, "E2E_DB 필요");

  test("잘못된 비밀번호 401 → 로그인 → 세션 유지 → 로그아웃 후 차단", async ({ request }) => {
    const bad = await request.post("/api/admin/login", {
      data: { password: "wrong-password" },
    });
    expect(bad.status()).toBe(401);

    const ok = await request.post("/api/admin/login", {
      data: { password: ADMIN_PASSWORD },
    });
    expect(ok.status()).toBe(200);

    // 세션 쿠키는 운영과 동일하게 Secure 로 내려온다 — E2E 는 http 로 접속하므로
    // 컨텍스트 자동 전송이 안 된다. 쿠키를 직접 추출해 명시 전달한다.
    const setCookie = ok
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value)
      .join("; ");
    const m = /admin_session=([0-9a-f]{64})/.exec(setCookie);
    expect(m).not.toBeNull();
    const cookie = { cookie: `admin_session=${m![1]}` };

    // 새로고침 시 세션 확인 경로 + 보호 API 접근
    expect((await request.get("/api/admin/login", { headers: cookie })).status()).toBe(200);
    expect((await request.get("/api/admin/stats", { headers: cookie })).status()).toBe(200);

    // 로그아웃(DELETE) → 서버 세션 철회 → 같은 쿠키로도 접근 불가
    expect((await request.delete("/api/admin/login", { headers: cookie })).ok()).toBeTruthy();
    expect((await request.get("/api/admin/login", { headers: cookie })).status()).toBe(401);
    expect((await request.get("/api/admin/stats", { headers: cookie })).status()).toBe(401);
  });
});

test.describe("E2E-6 체크인 운영 시간", () => {
  test.skip(!DB || !EVENT_KEY, "E2E_DB + CHECKIN_EVENT_KEY 필요");

  test("checkin disabled 상태에서는 올바른 행사 키로도 검색이 차단된다", async ({ request }) => {
    // 시드 기본값: site_settings.checkin_enabled = false (v24)
    const res = await request.post("/api/checkin/search", {
      data: { eventKey: EVENT_KEY, name: "홍길동", last4: "1234" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("window");
  });

  test("행사 키가 틀리면 운영 시간과 무관하게 403 event_key", async ({ request }) => {
    const res = await request.post("/api/checkin/search", {
      data: { eventKey: "wrong-key", name: "홍길동", last4: "1234" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe("event_key");
  });
});

test.describe("P1-4 알림 채널 가드", () => {
  test.skip(!DB, "E2E_DB 필요");

  test("채널 미설정이면 클레임하지 않고 조용히 0을 반환한다", async ({ request }) => {
    // CI 에는 TELEGRAM_*/KAKAO_* 가 없다. 이때 드레인이 행을 꺼내 놓고 못 보내면
    // 그 행은 'sending' 에 갇힌다 — 그래서 아예 클레임하지 않는 게 맞다.
    //
    // 이 테스트가 지키는 건 채널을 갈아끼울 때의 사고다: 환경변수만 지우고 가드를
    // 안 고치면 알림이 outbox 에 쌓이기만 하고 조용히 멈춘다. ready=false 가
    // 응답에 드러나야 안전망 워크플로가 그걸 장애로 잡는다.
    const res = await request.post("/api/notify");
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.ready).toBe(false);
    expect(j.channel).toBe("none");
    expect(j.claimed).toBe(0);
  });
});

test.describe("문제 4 관리 링크 복구", () => {
  test.skip(!DB, "E2E_DB 필요");

  test("이름·끝4자리·날짜만으로는 관리 토큰을 받지 못한다", async ({ request }) => {
    // 예전에는 이 셋이 맞으면 그 자리에서 manage_url 을 돌려줬다. 그 셋은
    // 청첩장을 받은 사람이면 대개 아는 정보라 본인 인증이 못 된다.
    const res = await request.post("/api/delivery/find", {
      data: { name: "E2E테스터", last4: "1234", date: "2026-10-10" },
    });
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).not.toMatch(/manage_url|manage_token/);
    expect(body).not.toMatch(/[0-9a-f]{32}/); // 어떤 토큰도 실리지 않는다
    expect(body).not.toMatch(/010-?\d{3,4}-?\d{4}/); // 전체 번호도 없다
  });

  test("일치하든 안 하든 같은 응답 — 존재 여부를 알 수 없다", async ({ request }) => {
    const hit = await request.post("/api/delivery/find", {
      data: { name: "E2E테스터", last4: "1234", date: "2026-10-10" },
    });
    const miss = await request.post("/api/delivery/find", {
      data: { name: "없는사람", last4: "0000", date: "2026-10-10" },
    });
    expect(hit.status()).toBe(miss.status());
    expect(await hit.text()).toBe(await miss.text());
  });

  test("위조·만료 복구 토큰은 401 이고 관리 링크를 주지 않는다", async ({ request }) => {
    const res = await request.post("/api/delivery/recover", {
      data: { token: "00000000000000000000000000000000" },
    });
    expect(res.status()).toBe(401);
    expect(await res.text()).not.toMatch(/manage_url/);
  });

  test("형식이 아닌 토큰도 조용히 401 (오류 종류를 알려주지 않는다)", async ({ request }) => {
    for (const token of ["", "abc", "<script>", "0".repeat(64)]) {
      const res = await request.post("/api/delivery/recover", { data: { token } });
      expect(res.status()).toBe(401);
    }
  });
});

test.describe("문제 7 마감 상태에서도 기존 신청 복구", () => {
  test.skip(!DB, "E2E_DB 필요 (Supabase 가 설정돼야 정원 조회가 일어난다)");

  /** 정원 조회 응답을 가로채 마감 상태를 만든다 (DB 를 건드리지 않는다) */
  const forceClosed = async (page: import("@playwright/test").Page) => {
    await page.route("**/rest/v1/rpc/get_delivery_guest_count", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "9999", // DELIVERY_CAPACITY(100) 초과
      })
    );
  };

  test("마감이면 신규 신청 메뉴는 막히지만 '내 신청 찾기'는 남는다", async ({ page }) => {
    // 정원이 차는 순간 기존 하객의 취소·변경까지 막히면 안 된다 —
    // 그건 신규 신청 정원과 아무 상관이 없는 일이다.
    await forceClosed(page);
    await page.goto("/delivery");

    await expect(page.getByText("아쉽게도 마감됐어요")).toBeVisible();
    // 신규 직접배달 진입은 계속 막힌다
    await expect(page.getByRole("button", { name: /종이 청첩장 직접 받기/ })).toHaveCount(0);
    // 복구 동선은 살아 있다
    await expect(page.getByRole("button", { name: /내 신청 찾기/ })).toBeVisible();
  });

  test("마감 상태로 ?find=1 로 들어오면 복구 폼이 열린 채 보인다", async ({ page }) => {
    await forceClosed(page);
    await page.goto("/delivery?find=1");

    await expect(page.getByText("아쉽게도 마감됐어요")).toBeVisible();
    await expect(page.getByPlaceholder("연락처 끝 4자리")).toBeVisible();
    await expect(page.getByRole("button", { name: /찾기/ })).toBeVisible();
  });

  test("마감이어도 유효한 관리 링크는 그대로 동작한다", async ({ request, page }) => {
    // ⚠️ **주말** 날짜여야 한다. 평일은 slotsForDate() 가 점심·저녁만 허용해서
    //    '오후' 로 신청하면 409(마감)가 아니라 400 이 온다.
    //    위 E2E-3 이 쓰는 날짜(10/10·10/11·10/03·10/04)와 겹치지 않게 고른다.
    const dates = ["2026-09-26", "2026-09-27", "2026-09-19", "2026-09-20"];
    let token: string | null = null;
    for (const date of dates) {
      const res = await request.post("/api/delivery/create", {
        data: {
          name: "마감테스터",
          phone: "010-9999-4321",
          location: "서울 강남구 테스트로 2",
          date,
          time: "오후",
          message: null,
        },
      });
      if (res.status() === 200) {
        token = (await res.json()).manage_token;
        break;
      }
      expect(res.status()).toBe(409);
    }
    expect(token).toMatch(/^[0-9a-f]{32}$/);

    await forceClosed(page);
    await page.goto(`/delivery/manage/${token}`);
    await expect(page.getByText("마감테스터").first()).toBeVisible();
  });
});
