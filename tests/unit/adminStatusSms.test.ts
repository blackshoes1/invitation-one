import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 상태 변경 시 문자 발송 범위.
 *
 * **확정에서만 보낸다.** 취소는 보내지 않는다 (2026-09-09 결정).
 * 취소 안내는 사정을 설명해야 하는 연락인데, 자동 문자는 "취소되었습니다"만
 * 남기고 끝나 하객을 더 당황하게 한다. 취소는 신랑신부가 직접 연락한다.
 *
 * 이 테스트가 없으면 나중에 조건 한 줄이 바뀌어도 아무도 모른다 —
 * 하객에게 나가는 문자라 조용히 되살아나면 안 된다.
 */
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
vi.mock("@/lib/sms", () => ({
  sendSms: mocks.sendSms,
  isSmsConfigured: true,
  smsConfigProblem: () => null,
}));
import { PATCH } from "@/app/api/admin/deliveries/[id]/route";

const DELIVERY = {
  id: "d1",
  date: "2026-09-19",
  time_slot: "오전",
  location: "강남구",
  status: "대기중",
};

function query(data: unknown, error: unknown = null) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    not: vi.fn(),
    update: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  for (const fn of [q.select, q.eq, q.neq, q.not, q.update, q.maybeSingle])
    fn.mockReturnValue(q);
  return q;
}

const patchStatus = (status: string) =>
  PATCH(
    new Request("https://example.invalid/api/admin/deliveries/d1", {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
    { params: Promise.resolve({ id: "d1" }) }
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(null);
  mocks.sendSms.mockResolvedValue({ ok: true });
});

describe("상태 변경 문자", () => {
  it("확정이면 참여자에게 보낸다", async () => {
    mocks.from
      .mockReturnValueOnce(query({ ...DELIVERY, status: "확정" })) // deliveries update
      .mockReturnValueOnce(query([{ name: "홍길동", phone: "010-1234-5678" }])) // participants
      .mockReturnValueOnce(query({ value: "" })); // site_settings (confirm_sms)

    const res = await patchStatus("확정");
    expect(res.status).toBe(200);
    expect(mocks.sendSms).toHaveBeenCalledTimes(1);
    expect(mocks.sendSms.mock.calls[0][1]).toContain("찾아뵙겠습니다");
  });

  it("취소면 한 통도 보내지 않는다 — 참여자에게 연락처가 있어도", async () => {
    mocks.from
      .mockReturnValueOnce(query({ ...DELIVERY, status: "취소" }))
      .mockReturnValue(query([{ name: "홍길동", phone: "010-1234-5678" }]));

    const res = await patchStatus("취소");
    expect(res.status).toBe(200);
    expect(mocks.sendSms).not.toHaveBeenCalled();
    // 발송을 시도조차 안 했으므로 결과 객체도 없어야 한다
    expect((await res.json()).sms ?? null).toBeNull();
  });
});
