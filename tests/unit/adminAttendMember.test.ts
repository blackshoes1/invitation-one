import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/adminAuth", () => ({ adminGuard: mocks.guard }));
import { POST } from "@/app/api/admin/groups/[id]/members/[memberId]/attend/route";

const group = "10000000-0000-0000-0000-000000000001";
const member = "10000000-0000-0000-0000-000000000002";
const rsvp = "10000000-0000-0000-0000-000000000003";

const call = (body: unknown = { side: "groom" }, ids = { id: group, memberId: member }) =>
  POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve(ids),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(null);
  mocks.rpc.mockResolvedValue({ data: [{ result: "created", rsvp_id: rsvp }], error: null });
});

it("관리자 인증 전에는 DB 를 건드리지 않는다", async () => {
  mocks.guard.mockResolvedValue(new Response(null, { status: 401 }));
  expect((await call()).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("id 형식이 잘못되면 400", async () => {
  expect((await call({ side: "groom" }, { id: "bad", memberId: member })).status).toBe(400);
  expect((await call({ side: "groom" }, { id: group, memberId: "bad" })).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("측(신랑/신부)은 필수 — 없거나 이상한 값이면 400", async () => {
  for (const body of [null, {}, [], { side: "" }, { side: "common" }, { side: 1 }]) {
    expect((await call(body)).status).toBe(400);
  }
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("연락처 형식이 틀리면 400, 비어 있으면 null 로 보낸다", async () => {
  expect((await call({ side: "bride", phone: "12345" })).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();

  await call({ side: "bride", phone: "  " });
  expect(mocks.rpc.mock.calls[0][1].p_phone).toBeNull();
});

it("연락처는 하객 폼과 같은 형식으로 정돈해 보낸다", async () => {
  await call({ side: "groom", phone: "01012345678" });
  expect(mocks.rpc.mock.calls[0][1].p_phone).toBe("010-1234-5678");
});

it("동반 인원수와 이름 칸 수가 항상 같다 — 부족하면 빈 칸, 넘치면 자른다", async () => {
  await call({ side: "groom", companionCount: 3, companionNames: [" 김철수 "] });
  expect(mocks.rpc).toHaveBeenLastCalledWith("admin_attend_member_v1", {
    p_group: group,
    p_member: member,
    p_side: "groom",
    p_phone: null,
    p_companions: 3,
    p_names: ["김철수", "", ""],
  });

  await call({ side: "groom", companionCount: 1, companionNames: ["a", "b", "c"] });
  expect(mocks.rpc.mock.calls[1][1].p_names).toEqual(["a"]);
});

it("동반 인원수는 0~19 로 보정한다 (숫자가 아니면 0)", async () => {
  await call({ side: "groom", companionCount: 99 });
  expect(mocks.rpc.mock.calls[0][1].p_companions).toBe(19);
  await call({ side: "groom", companionCount: -4 });
  expect(mocks.rpc.mock.calls[1][1].p_companions).toBe(0);
  await call({ side: "groom", companionCount: "abc" });
  expect(mocks.rpc.mock.calls[2][1].p_companions).toBe(0);
});

it("클라이언트가 보낸 이름은 쓰지 않는다 — 명단의 이름은 DB 가 읽는다", async () => {
  await call({ side: "groom", name: "forged" });
  const args = mocks.rpc.mock.calls[0][1];
  expect(args).not.toHaveProperty("p_name");
  expect(JSON.stringify(args)).not.toContain("forged");
});

it("결과(created / linked)와 rsvp id 를 돌려준다", async () => {
  expect(await (await call()).json()).toEqual({ result: "created", rsvp_id: rsvp });
  mocks.rpc.mockResolvedValue({ data: [{ result: "linked", rsvp_id: rsvp }], error: null });
  expect(await (await call()).json()).toEqual({ result: "linked", rsvp_id: rsvp });
});

it.each([
  ["member_not_found", 404],
  ["already_registered", 409],
  ["invalid_side", 400],
  ["private database details", 500],
])("DB 오류 %s → %i, 내부 메시지는 노출하지 않는다", async (message, status) => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message } });
  const res = await call();
  expect(res.status).toBe(status);
  expect((await res.json()).error).not.toContain("database details");
});

it("유니크 위반(같은 그룹에 같은 RSVP 연결)은 409", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "dup" } });
  expect((await call()).status).toBe(409);
});
