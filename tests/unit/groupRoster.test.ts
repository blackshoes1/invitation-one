import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 그룹 명단 이름 목록 API.
 *
 * 이 라우트의 존재 이유는 "그룹 링크로 들어온 하객의 타이핑을 줄이는 것" 하나뿐이다.
 * 그래서 **이름 말고는 아무것도 내보내지 않는다** — 연락처(마스킹본 포함)든
 * member_id 든 하나라도 새면 단톡방 링크가 곧 남의 정보 조회 수단이 된다.
 * 아래 테스트가 지키는 것이 그 선이다.
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
  it("이름만 내려준다 — 연락처 컬럼은 조회조차 하지 않는다", async () => {
    const group = query({ id: "g1" });
    const members = query([
      { name: "홍길동" },
      { name: "김철수" },
      { name: " 이영희 " },
    ]);
    mocks.from.mockReturnValueOnce(group).mockReturnValueOnce(members);

    const res = await request("?slug=our-group");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ names: ["김철수", "이영희", "홍길동"] });
    // 이름 외 컬럼을 실수로 얹으면 여기서 잡힌다 (phone, invite_token_hash, id …)
    expect(members.select).toHaveBeenCalledWith("name");
    expect(group.select).toHaveBeenCalledWith("id");
  });

  it("동명이인은 한 줄로 합친다", async () => {
    mocks.from
      .mockReturnValueOnce(query({ id: "g1" }))
      .mockReturnValueOnce(query([{ name: "김민수" }, { name: "김민수" }]));
    expect(await (await request("?slug=our-group")).json()).toEqual({
      names: ["김민수"],
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
