import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  guard: vi.fn(),
  sendSms: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: mocks.from },
  isAdminConfigured: true,
}));
vi.mock("@/lib/adminAuth", () => ({ adminGuard: mocks.guard }));
vi.mock("@/lib/sms", () => ({ sendSms: mocks.sendSms }));

import { PATCH } from "@/app/api/admin/deliveries/[id]/route";

const DELIVERY = {
  id: "d1",
  date: "2026-09-19",
  time_slot: "오전",
  location: "서울 강남구",
  status: "취소",
};

function query(data: unknown, error: unknown = null) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  for (const fn of [q.select, q.eq, q.update, q.maybeSingle])
    fn.mockReturnValue(q);
  return q;
}

const updateSchedule = (date: string) =>
  PATCH(
    new Request("https://example.invalid/api/admin/deliveries/d1", {
      method: "PATCH",
      body: JSON.stringify({
        date,
        time_slot: "오전",
        location: "서울 강남구 새 장소",
        notify: false,
      }),
    }),
    { params: Promise.resolve({ id: "d1" }) }
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(null);
});

describe("관리자 일정 변경 마감 검사", () => {
  it("현재 주문 날짜가 마감돼 있어도 자기 일정·장소는 수정한다", async () => {
    mocks.from
      .mockReturnValueOnce(query({ date: DELIVERY.date }))
      .mockReturnValueOnce(query({ ...DELIVERY, location: "서울 강남구 새 장소" }));

    const response = await updateSchedule(DELIVERY.date);

    expect(response.status).toBe(200);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
      "deliveries",
      "deliveries",
    ]);
  });

  it("다른 마감 날짜로 옮기는 것은 계속 막는다", async () => {
    mocks.from
      .mockReturnValueOnce(query({ date: DELIVERY.date }))
      .mockReturnValueOnce(query({ date: "2026-09-20" }));

    const response = await updateSchedule("2026-09-20");

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("차단된 날짜");
  });
});
