import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn(), select: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/adminAuth", () => ({ adminGuard: mocks.guard }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
import { PATCH as groupPatch } from "@/app/api/admin/groups/[id]/members/route";
import { PATCH as soloPatch } from "@/app/api/admin/invitees/route";

const group = "10000000-0000-0000-0000-000000000001";
const member = "10000000-0000-0000-0000-000000000002";
const saved = { id: member, name: "안내하객", phone: "010-1234-5678" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue(null);
  mocks.rpc.mockReturnValue({ select: mocks.select });
  mocks.select.mockReturnValue({ maybeSingle: mocks.single });
  mocks.single.mockResolvedValue({ data: saved, error: null });
});

for (const scope of ["group", "solo"] as const) {
  const request = (body: unknown = { member_id: member, phone: "01012345678" }) => {
    const req = new Request("http://localhost/api/admin/members", { method: "PATCH", body: JSON.stringify(body) });
    return scope === "group" ? groupPatch(req, { params: Promise.resolve({ id: group }) }) : soloPatch(req);
  };

  describe(`${scope} member phone`, () => {
    it("requires admin authorization before updating contacts", async () => {
      mocks.guard.mockResolvedValue(new Response(null, { status: 401 }));
      expect((await request()).status).toBe(401);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("requires a member id", async () => {
      expect((await request({ phone: "01012345678" })).status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it("normalizes the phone and scopes the atomic update to this member", async () => {
      const res = await request();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ member: saved });
      expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("admin_update_member_phone_v1", {
        p_group: scope === "group" ? group : null,
        p_member: member,
        p_phone: "010-1234-5678",
      });
      expect(mocks.select).toHaveBeenCalledWith(scope === "group"
        ? "id, group_id, name, phone, invited_at, created_at"
        : "id, group_id, name, phone, invited_at, created_at, rsvp_id");
    });

    it("rejects an invalid phone before updating either contact", async () => {
      expect((await request({ member_id: member, phone: "01012" })).status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it.each(["", "  ", null])("passes blank phone %j as an explicit deletion", async (phone) => {
      await request({ member_id: member, phone });
      expect(mocks.rpc).toHaveBeenCalledWith("admin_update_member_phone_v1", {
        p_group: scope === "group" ? group : null, p_member: member, p_phone: null,
      });
    });

    it("returns 404 when the scoped member does not exist", async () => {
      mocks.single.mockResolvedValue({ data: null, error: null });
      expect((await request()).status).toBe(404);
    });

    it("reports duplicate RSVP contacts as a conflict without exposing database details", async () => {
      mocks.single.mockResolvedValue({ data: null, error: { code: "23505", message: "private constraint details" } });
      const res = await request();
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "같은 이름·연락처로 등록된 참석자가 있어요. 기존 참석자 연락처를 확인해주세요." });
    });

    it("preserves the existing response for other database errors", async () => {
      mocks.single.mockResolvedValue({ data: null, error: { code: "XX000", message: "update failed" } });
      const res = await request();
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "update failed" });
    });
  });
}
