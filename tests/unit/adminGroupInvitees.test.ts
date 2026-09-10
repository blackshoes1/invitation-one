import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/adminAuth", () => ({ adminGuard: mocks.guard }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
import { POST } from "@/app/api/admin/invitees/group/route";

const member = "10000000-0000-0000-0000-000000000001";
const group = "20000000-0000-0000-0000-000000000001";
const request = (body: unknown) => POST(new Request("http://localhost/api/admin/invitees/group", {
  method: "POST", body: JSON.stringify(body),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(null);
  mocks.rpc.mockResolvedValue({ data: { group: { id: group }, assigned_count: 1 }, error: null });
});

describe("admin bulk grouping", () => {
  it("requires admin authorization before touching data", async () => {
    mocks.guard.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await request({ member_ids: [member], group_id: group })).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    null, [], {}, { member_ids: [], group_id: group },
    { member_ids: [member, member], group_id: group },
    { member_ids: ["not-uuid"], group_id: group },
    { member_ids: Array(501).fill(member), group_id: group },
    { member_ids: [member], new_group_name: 123, request_id: group },
    { member_ids: [member], new_group_name: " ", request_id: group },
    { member_ids: [member], new_group_name: "a".repeat(101), request_id: group },
    { member_ids: [member], new_group_name: "친구" },
    { member_ids: [member], group_id: group, new_group_name: "친구", request_id: group },
    { member_ids: [member], group_id: group, request_id: group },
  ])("rejects invalid input: %j", async (body) => {
    expect((await request(body)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("moves to an existing group in one atomic RPC", async () => {
    expect((await request({ member_ids: [member], group_id: group })).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_group_invitees", {
      p_member_ids: [member], p_group_id: group, p_new_group_name: null,
    });
  });

  it("uses the same caller-provided ID when retrying new group creation", async () => {
    const body = { member_ids: [member], new_group_name: " 친구들 ", request_id: group };
    await request(body);
    await request(body);
    expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_group_invitees", {
      p_member_ids: [member], p_group_id: group, p_new_group_name: "친구들",
    });
  });

  it.each([["invitees_changed", 409], ["group_not_found", 404], ["group_conflict", 409], ["internal secret", 500]])(
    "maps %s without leaking internals", async (message, status) => {
      mocks.rpc.mockResolvedValue({ data: null, error: { message } });
      const response = await request({ member_ids: [member], group_id: group });
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain("internal secret");
    }
  );
});
