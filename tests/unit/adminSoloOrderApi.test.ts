import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), guard: vi.fn(), sms: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/lib/adminAuth", () => ({ adminGuard: mocks.guard }));
vi.mock("@/lib/sms", () => ({ sendSms: mocks.sms }));
import { POST } from "@/app/api/admin/deliveries/route";
import { PATCH } from "@/app/api/admin/deliveries/[id]/route";
beforeEach(() => {
  vi.clearAllMocks(); mocks.guard.mockResolvedValue(null);
  const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.maybeSingle.mockResolvedValue({ data: null });
  mocks.from.mockReturnValue(q);
  mocks.rpc.mockResolvedValue({ data: { delivery_id: "d", with_owner: true, roster: { added: 0, linked: 0, skipped: [], review: [] } } });
});
const member = "10000000-0000-0000-0000-000000000001";
const create = (extra = {}) => POST(new Request("http://localhost/api/admin/deliveries", { method: "POST",
  body: JSON.stringify({ member_id: member, date: "2026-09-28", time_slot: "저녁", location: "서울 강남구", request_key: "request-key", ...extra }) }));
it("uses the selected member ID rather than client supplied identity", async () => {
  expect((await create({ owner_name: "위조이름", owner_phone: "invalid" })).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("admin_create_solo_order_v1", expect.objectContaining({ p_member: member }));
  expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_owner_name");
  expect(mocks.sms).not.toHaveBeenCalled();
});
it("rejects group/member mixing and reports existing applications", async () => {
  expect((await create({ group_id: member })).status).toBe(400);
  mocks.rpc.mockResolvedValue({ error: { message: "already_ordered" } });
  expect((await create()).status).toBe(409);
});
it("guards both creation and restoration", async () => {
  mocks.guard.mockResolvedValue(new Response(null, { status: 401 }));
  expect((await create()).status).toBe(401);
  expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: '{"action":"restore"}' }), { params: Promise.resolve({ id: "d" }) })).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("restores without SMS and reports conflicts without falling through to a status update", async () => {
  for (const result of ["ok", "already_restored", "conflict", "blocked"]) {
    mocks.rpc.mockResolvedValue({ data: result });
    const res = await PATCH(new Request("http://localhost", { method: "PATCH", body: '{"action":"restore"}' }), { params: Promise.resolve({ id: "d" }) });
    expect(res.status).toBe(["ok", "already_restored"].includes(result) ? 200 : 409);
  }
  expect(mocks.sms).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
});
