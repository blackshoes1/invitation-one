import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 상태 변경 시 문자 발송 범위.
 *
 * **확정에서만 보낸다.** 취소도, 완료(리뷰요청)도 보내지 않는다 (2026-09-09 결정).
 *
 * 취소 안내는 사정을 설명해야 하는 연락인데, 자동 문자는 "취소되었습니다"만
 * 남기고 끝나 하객을 더 당황하게 한다. 취소는 신랑신부가 직접 연락한다.
 * 리뷰요청은 청첩장을 받은 하객에게 후기를 조르는 문자라 아예 빼기로 했다.
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

const patchStatus = (status: string, notify?: unknown) =>
  PATCH(
    new Request("https://example.invalid/api/admin/deliveries/d1", {
      method: "PATCH",
      body: JSON.stringify({ status, notify }),
    }),
    { params: Promise.resolve({ id: "d1" }) }
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(null);
  mocks.sendSms.mockResolvedValue({ ok: true });
});

describe("상태 변경 문자", () => {
  it("문자 없이 확정하면 상태만 저장하고 연락처 조회나 발송은 하지 않는다", async () => {
    const order = query({ ...DELIVERY, status: "확정" });
    mocks.from.mockReturnValueOnce(order);
    const res = await patchStatus("확정", false);
    expect(res.status).toBe(200);
    expect(order.update).toHaveBeenCalledWith({ status: "확정" });
    expect((await res.json()).sms).toBeNull();
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("발송을 선택하면 연결된 명단 번호를 사용하고 기존 주문 번호는 우선한다", async () => {
    mocks.from
      .mockReturnValueOnce(query({ ...DELIVERY, status: "확정" }))
      .mockReturnValueOnce(query([
        { name: "명단연결", phone: null, group_member: { phone: "010-1111-2222" } },
        { name: "기존번호", phone: "010-3333-4444", group_member: { phone: "010-5555-6666" } },
        { name: "미등록", phone: null, group_member: null },
      ]))
      .mockReturnValueOnce(query({ value: "" }));
    const res = await patchStatus("확정", true);
    expect(res.status).toBe(200);
    expect(mocks.sendSms.mock.calls.map(([phone]) => phone)).toEqual(["010-1111-2222", "010-3333-4444"]);
    expect((await res.json()).sms).toMatchObject({ count: 2, sent: 2 });
  });

  it("이미 확정된 주문을 재요청해도 문자를 보내지 않는다", async () => {
    mocks.from.mockReturnValueOnce(query(null)).mockReturnValueOnce(query({ ...DELIVERY, status: "확정" }));
    expect((await patchStatus("확정", true)).status).toBe(200);
    expect(mocks.sendSms).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it.each(["false", null, 0])("잘못된 발송 선택은 상태를 저장하기 전에 거절한다: %j", async notify => {
    expect((await patchStatus("확정", notify)).status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

  it("연락처 조회 실패를 발송 성공으로 표시하지 않는다", async () => {
    mocks.from.mockReturnValueOnce(query({ ...DELIVERY, status: "확정" }))
      .mockReturnValueOnce(query(null, { message: "lookup failed" }));
    const res = await patchStatus("확정", true);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("주문은 확정됐지만");
    expect(mocks.sendSms).not.toHaveBeenCalled();
  });

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

  it("완료(리뷰요청)도 보내지 않는다 — 발송은 확정 하나뿐이다", async () => {
    mocks.from
      .mockReturnValueOnce(query({ ...DELIVERY, status: "완료" }))
      .mockReturnValue(query([{ id: "p1", name: "홍길동", phone: "010-1234-5678" }]));

    const res = await patchStatus("완료");
    expect(res.status).toBe(200);
    expect(mocks.sendSms).not.toHaveBeenCalled();
    expect((await res.json()).sms ?? null).toBeNull();
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
