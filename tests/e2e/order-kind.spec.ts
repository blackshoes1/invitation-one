import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * 그룹/개인 주문 분리 (A안) 회귀 방지 — DB 필요 (E2E_DB=1 + 시드).
 *
 * 잠그는 규칙 두 가지:
 *  - 주문 종류는 **진입 경로**가 결정한다 (`src/lib/orderKind.ts`)
 *      /delivery?i=<t>              → 개인 주문 (group_id = null)
 *      /delivery/group/<slug>?i=<t> → 그룹 주문
 *  - 초대 토큰은 **신원**만 담당한다 (결함 ①)
 *      연락처를 직접 입력해도 토큰은 그대로 오고, 명단 연결(group_member_id)이
 *      유지된다. 예전 폼은 "다른 번호 쓰기"를 누르면 토큰까지 지워 신원이 사라졌다.
 *
 * 관측 지점은 어드민 명단 API (`/api/admin/groups/<id>/members`):
 *   applied  — 이 사람 이름으로 신청이 있는가 (= group_member_id 연결됨)
 *   personal — 그 신청이 전부 개인 주문인가
 *
 * 테스트마다 명단에 **새 사람**을 만들고 토큰을 새로 발급한다. 시드 한 명을
 * 공유하면 앞 테스트가 남긴 주문 때문에 재시도(retry)가 실패한다.
 */
const DB = Boolean(process.env.E2E_DB);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "e2e-admin-pass";
const GROUP_SLUG = "e2e-group";

/** 평일(점심·저녁) 후보 — 기존 스펙이 쓰는 주말 날짜와 겹치지 않게 */
const WEEKDAYS = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"];
let nextDate = 0;

interface Member {
  id: string;
  name: string;
  applied: boolean;
  personal: boolean;
}

/** 로그인은 파일당 한 번 — 관리자 로그인은 IP 당 10회/10분으로 제한된다 */
let cachedHeaders: Record<string, string> | null = null;

async function admin(request: APIRequestContext) {
  if (cachedHeaders) return cachedHeaders;
  const ok = await request.post("/api/admin/login", {
    data: { password: ADMIN_PASSWORD },
  });
  expect(ok.status()).toBe(200);
  // 세션 쿠키는 운영과 동일하게 Secure 라 http E2E 에서 자동 전송되지 않는다
  const setCookie = ok
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value)
    .join("; ");
  const m = /admin_session=([0-9a-f]{64})/.exec(setCookie);
  expect(m).not.toBeNull();
  cachedHeaders = { cookie: `admin_session=${m![1]}` };
  return cachedHeaders;
}

async function groupId(request: APIRequestContext, headers: Record<string, string>) {
  const res = await request.get("/api/admin/groups", { headers });
  expect(res.status()).toBe(200);
  const groups = (await res.json()).groups as { id: string; slug: string }[];
  const g = groups.find((x) => x.slug === GROUP_SLUG);
  expect(g, `시드 그룹 ${GROUP_SLUG} 없음`).toBeTruthy();
  return g!.id;
}

/** 명단에 새 사람 + 연락처 + 초대 토큰까지 만들어 돌려준다 */
async function newMember(
  request: APIRequestContext,
  headers: Record<string, string>,
  gid: string,
  name: string
): Promise<{ id: string; token: string }> {
  const add = await request.post(`/api/admin/groups/${gid}/members`, {
    headers,
    data: { name },
  });
  expect(add.status()).toBe(200);
  const id = (await add.json()).member.id as string;

  const patch = await request.patch(`/api/admin/groups/${gid}/members`, {
    headers,
    data: { member_id: id, phone: "010-7777-0000" },
  });
  expect(patch.status()).toBe(200);

  const inv = await request.post(`/api/admin/groups/${gid}/members/invite`, {
    headers,
    data: { member_id: id },
  });
  expect(inv.status()).toBe(200);
  const personalUrl = (await inv.json()).links[0].personalUrl as string;
  const t = /\?i=([0-9a-f]{32})/.exec(personalUrl);
  expect(t, "초대 링크에서 토큰을 못 찾음").not.toBeNull();
  return { id, token: t![1] };
}

async function memberById(
  request: APIRequestContext,
  headers: Record<string, string>,
  gid: string,
  memberId: string
): Promise<Member> {
  const res = await request.get(`/api/admin/groups/${gid}/members`, { headers });
  expect(res.status()).toBe(200);
  const members = (await res.json()).members as Member[];
  const m = members.find((x) => x.id === memberId);
  expect(m, "방금 만든 명단 행이 안 보임").toBeTruthy();
  return m!;
}

/** 날짜는 전역 유일 — 이미 찼으면(409) 다음 후보로 */
async function createOrder(
  request: APIRequestContext,
  body: Record<string, unknown>
) {
  for (; nextDate < WEEKDAYS.length; nextDate++) {
    const res = await request.post("/api/delivery/create", {
      data: {
        location: "서울 강남구 테스트로 1",
        date: WEEKDAYS[nextDate],
        time: "저녁",
        ...body,
      },
    });
    if (res.status() === 200) {
      nextDate++;
      return res;
    }
    expect(res.status(), await res.text()).toBe(409); // date_taken 만 허용
  }
  throw new Error("후보 날짜 소진");
}

test.describe.serial("그룹/개인 주문 분리", () => {
  test.skip(!DB, "E2E_DB 필요");

  test("개인 링크 + 직접 입력한 번호 → 개인 주문이면서 명단 연결은 유지된다", async ({
    request,
  }) => {
    const headers = await admin(request);
    const gid = await groupId(request, headers);
    const me = await newMember(request, headers, gid, `E2E개인${Date.now()}`);

    // 새로 만든 사람이라 아직 신청이 없다 — 이 단언이 있어야 뒤가 의미를 갖는다
    expect((await memberById(request, headers, gid, me.id)).applied).toBe(false);

    // "다른 번호 쓰기" 상태의 폼이 보내는 payload — 토큰은 그대로, 번호만 직접 입력
    const res = await createOrder(request, {
      name: "개인신청자",
      phone: "010-5555-1234",
      inviteToken: me.token,
      // groupSlug 없음 = /delivery?i= 로 들어온 개인 주문
    });
    expect(res.status()).toBe(200);

    const m = await memberById(request, headers, gid, me.id);
    expect(m.applied, "번호를 직접 입력해도 명단 연결이 남아야 한다").toBe(true);
    expect(m.personal, "그룹 페이지가 아니면 개인 주문").toBe(true);
  });

  test("그룹 링크 → 그룹 주문 (같은 토큰이라도 진입 경로로 갈린다)", async ({
    request,
  }) => {
    const headers = await admin(request);
    const gid = await groupId(request, headers);
    const me = await newMember(request, headers, gid, `E2E그룹${Date.now()}`);

    const res = await createOrder(request, {
      name: "그룹신청자",
      phone: "010-5555-4321",
      inviteToken: me.token,
      groupSlug: GROUP_SLUG,
    });
    expect(res.status()).toBe(200);

    const m = await memberById(request, headers, gid, me.id);
    expect(m.applied).toBe(true);
    expect(m.personal, "그룹 페이지에서 들어왔으면 그룹 주문").toBe(false);
  });

  test("형식이 틀린 번호는 초대 번호로 조용히 대체하지 않고 400", async ({ request }) => {
    const headers = await admin(request);
    const gid = await groupId(request, headers);
    const me = await newMember(request, headers, gid, `E2E오타${Date.now()}`);

    // 오타를 그냥 넘기면 하객은 번호를 바꾼 줄 알지만 실제로는 옛 번호로 배송된다
    const res = await request.post("/api/delivery/create", {
      data: {
        name: "오타입력자",
        phone: "010-12",
        inviteToken: me.token,
        location: "서울 강남구 테스트로 1",
        date: WEEKDAYS[WEEKDAYS.length - 1],
        time: "저녁",
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("phone_invalid");
  });

  test("없는 그룹 슬러그로는 주문이 만들어지지 않는다 (서버가 그룹을 조회한다)", async ({
    request,
  }) => {
    const res = await request.post("/api/delivery/create", {
      data: {
        name: "홍길동",
        phone: "010-5555-9876",
        groupSlug: "존재하지-않는-그룹",
        location: "서울 강남구 테스트로 1",
        date: WEEKDAYS[WEEKDAYS.length - 1],
        time: "저녁",
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("group_invalid");
  });
});
