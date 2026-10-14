import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), from: vi.fn(), select: vi.fn(), order: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/adminAuth", () => ({ adminGuard: mocks.guard }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: mocks.from } }));
import { GET } from "@/app/api/admin/deliveries/route";

const request = (query = "") => GET(new Request(`http://localhost/api/admin/deliveries${query}`));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(null);
  mocks.from.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ order: mocks.order });
  mocks.order.mockReturnValue({ eq: mocks.eq });
});

describe("admin order contacts", () => {
  it("fills missing order phones from the linked roster without changing existing phones", async () => {
    const participants = [
      { id: "p1", name: "테스트", phone: null, group_member: { phone: "010-1111-2222" } },
      { id: "p2", name: "테스트", phone: "010-3333-4444", group_member: { phone: "010-5555-6666" } },
      { id: "p3", name: "테스트", phone: "", group_member: null },
      { id: "p4", name: "테스트", phone: "  ", group_member: { phone: "010-7777-8888" } },
    ];
    mocks.eq.mockResolvedValue({ data: [{ id: "d1", participants }], error: null });
    const response = await request();
    expect(response.status).toBe(200);
    const { deliveries } = await response.json();
    expect(deliveries[0].participants).toEqual([
      { id: "p1", name: "테스트", phone: "010-1111-2222" },
      { id: "p2", name: "테스트", phone: "010-3333-4444" },
      { id: "p3", name: "테스트", phone: null },
      { id: "p4", name: "테스트", phone: "010-7777-8888" },
    ]);
    expect(participants[0].phone).toBeNull();
    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining("group_members!group_member_id(phone)"));
    expect(mocks.eq).toHaveBeenCalledWith("hidden", false);
  });

  it("denies access before reading contact details", async () => {
    mocks.guard.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await request()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("reports a failed lookup rather than showing an empty contact list", async () => {
    mocks.eq.mockResolvedValue({ data: null, error: { message: "lookup failed" } });
    expect((await request()).status).toBe(500);
  });
});
