import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 그룹 명단 이름 목록 API.
 *
 * 이 라우트의 존재 이유는 "그룹 링크로 들어온 하객의 타이핑을 줄이는 것" 하나뿐이다.
 * 그래서 내보내는 것은 **이름과 hasPhone(있음/없음) 뿐이다** — 연락처는 마스킹본
 * 조차 내려가지 않는다. 번호는 제출 시점에 서버가 붙인다(`rosterPhone`). 한 자리도
 * 새면 단톡방 링크가 곧 남의 번호 조회 수단이 된다. 아래 테스트가 지키는 선이다.
 */
const mocks = vi.hoisted(() => ({ from: vi.fn(), allow: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: mocks.from },
  isAdminConfigured: true,
}));
vi.mock("@/lib/rateLimit", () => ({
  rateLimitAllow: mocks.allow,
  clientIp: () => "test",
}));
import { GET } from "@/app/api/delivery/group/roster/route";

function query(data: unknown, error: unknown = null) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  for (const fn of [q.select, q.eq, q.limit, q.maybeSingle]) fn.mockReturnValue(q);
  return q;
}

const request = (qs: string) =>
  GET(new Request(`http://localhost/api/delivery/group/roster${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allow.mockResolvedValue(true);
});

describe("group roster API", () => {
  it("번호는 한 자리도 안 나간다 — 있음/없음만", async () => {
    const group = query({ id: "g1" });
    const members = query([
      { name: "홍길동", phone: "010-1234-5678" },
      { name: "김철수", phone: null },
      { name: " 이영희 ", phone: "not-a-phone" },
    ]);
    mocks.from.mockReturnValueOnce(group).mockReturnValueOnce(members);

    const res = await request("?slug=our-group");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      names: [
        { name: "김철수", hasPhone: false },
        { name: "이영희", hasPhone: false }, // 형식이 깨진 번호는 못 쓴다
        { name: "홍길동", hasPhone: true },
      ],
    });
    // 번호가 어떤 형태로든(마스킹 포함) 실려 나가면 여기서 잡힌다
    expect(JSON.stringify(body)).not.toMatch(/\d{3,}/);
    // 이름·번호 외 컬럼을 실수로 얹으면 여기서 잡힌다 (id, invite_token_hash …)
    expect(members.select).toHaveBeenCalledWith("name, phone");
    expect(group.select).toHaveBeenCalledWith("id");
  });

  it("동명이인은 한 줄로 합치고 번호를 못 쓰게 한다", async () => {
    // 누구 번호인지 정할 수 없다 — 아무거나 붙이면 엉뚱한 사람에게 배송 연락이 간다
    mocks.from
      .mockReturnValueOnce(query({ id: "g1" }))
      .mockReturnValueOnce(
        query([
          { name: "김민수", phone: "010-1111-2222" },
          { name: "김민수", phone: "010-3333-4444" },
        ])
      );
    expect(await (await request("?slug=our-group")).json()).toEqual({
      names: [{ name: "김민수", hasPhone: false }],
    });
  });

  it("없는 그룹도 빈 목록으로 답한다 — 슬러그 존재 여부를 알려주지 않는다", async () => {
    mocks.from.mockReturnValueOnce(query(null));
    const res = await request("?slug=does-not-exist");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ names: [] });
    expect(mocks.from).toHaveBeenCalledTimes(1); // 명단 조회로 넘어가지 않는다
  });

  it("캐시에 남지 않는다", async () => {
    mocks.from.mockReturnValueOnce(query(null));
    expect((await request("?slug=x")).headers.get("Cache-Control")).toContain(
      "no-store"
    );
  });

  it("슬러그가 없으면 400 — DB 를 건드리지 않는다", async () => {
    expect((await request("")).status).toBe(400);
    expect((await request("?slug=%20%20")).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("긁어가려 하면 429", async () => {
    mocks.allow.mockResolvedValue(false);
    expect((await request("?slug=our-group")).status).toBe(429);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("조회 실패를 빈 명단으로 위장하지 않는다", async () => {
    mocks.from
      .mockReturnValueOnce(query({ id: "g1" }))
      .mockReturnValueOnce(query(null, { message: "db down" }));
    expect((await request("?slug=our-group")).status).toBe(500);
  });
});
