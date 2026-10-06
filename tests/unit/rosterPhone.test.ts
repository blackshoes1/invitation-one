import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 명단에서 고른 이름 → 연락처 (`rosterPhone`).
 *
 * 이 함수가 그룹 링크 하객의 연락처를 채우는 **유일한 경로**다. 번호는 여기서만
 * 읽히고 응답으로는 나가지 않는다 — 초대 토큰이 `_invite_phone` 으로 채우는 것과
 * 같은 원칙이다.
 *
 * 못 찾으면 반드시 null 이어야 한다. 아무 번호나 붙이면 **엉뚱한 사람의 번호로
 * 배송 연락이 간다.**
 */
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: mocks.from },
  isAdminConfigured: true,
}));
import { rosterPhone } from "@/lib/deliveryApi";

function query(data: unknown) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve),
  };
  for (const fn of [q.select, q.eq, q.limit]) fn.mockReturnValue(q);
  return q;
}

beforeEach(() => vi.clearAllMocks());

describe("rosterPhone", () => {
  it("그룹 안에서 이름이 하나만 맞으면 그 번호", async () => {
    const q = query([{ phone: "010-1234-5678" }]);
    mocks.from.mockReturnValue(q);
    expect(await rosterPhone("g1", "홍길동")).toBe("010-1234-5678");
    // 반드시 그룹 안에서만 찾는다 — 다른 그룹 명단으로 새면 안 된다
    expect(q.eq).toHaveBeenCalledWith("group_id", "g1");
    expect(q.eq).toHaveBeenCalledWith("name", "홍길동");
  });

  it("동명이인이면 null — 아무 번호나 붙이지 않는다", async () => {
    mocks.from.mockReturnValue(
      query([{ phone: "010-1111-2222" }, { phone: "010-3333-4444" }])
    );
    expect(await rosterPhone("g1", "김민수")).toBeNull();
  });

  it("명단에 없는 이름이면 null", async () => {
    mocks.from.mockReturnValue(query([]));
    expect(await rosterPhone("g1", "모르는사람")).toBeNull();
  });

  it("번호가 없거나 형식이 깨져 있으면 null", async () => {
    mocks.from.mockReturnValue(query([{ phone: null }]));
    expect(await rosterPhone("g1", "홍길동")).toBeNull();
    mocks.from.mockReturnValue(query([{ phone: "번호없음" }]));
    expect(await rosterPhone("g1", "홍길동")).toBeNull();
  });

  it("그룹이 없으면 조회조차 하지 않는다 (개인 주문 경로)", async () => {
    expect(await rosterPhone(null, "홍길동")).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
