import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/adminAuth", () => ({ adminGuard: mocks.guard }));
import { POST } from "@/app/api/admin/deliveries/[id]/members/route";
const id = "10000000-0000-0000-0000-000000000001";
const member = "10000000-0000-0000-0000-000000000002";
const call = (body: unknown = { member_id: member }, order = id) => POST(new Request("http://localhost", {
  method: "POST", body: JSON.stringify(body),
}), { params: Promise.resolve({ id: order }) });
beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue(null); mocks.rpc.mockResolvedValue({ data: "added" }); });
it("requires administrator authentication before accessing data", async () => {
  mocks.guard.mockResolvedValue(new Response(null, { status: 401 }));
  expect((await call()).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects null, malformed and missing identifiers", async () => {
  for (const body of [null, {}, [], { member_id: 1 }, { member_id: "bad" }]) expect((await call(body)).status).toBe(400);
  expect((await call({ member_id: member }, "bad")).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("takes identity from the roster, ignores client identity and returns retry outcome", async () => {
  mocks.rpc.mockResolvedValue({ data: "already_on_order" });
  expect(await (await call({ member_id: member, name: "forged", phone: "forged" })).json()).toEqual({ result: "already_on_order" });
  expect(mocks.rpc).toHaveBeenCalledWith("admin_add_order_member_v1", { p_delivery: id, p_member: member });
});
it.each([['order_not_found',404],['member_not_found',404],['group_mismatch',409],['invalid_status',409],['already_ordered',409],['identity_conflict',409],['private database details',500]])("maps %s without leaking database details", async (message, status) => {
  mocks.rpc.mockResolvedValue({ error: { message } });
  const res = await call(); expect(res.status).toBe(status);
  expect((await res.json()).error).not.toContain(message);
});
