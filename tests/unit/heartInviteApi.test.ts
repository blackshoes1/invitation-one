import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), allow: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ isAdminConfigured: true, supabaseAdmin: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/lib/rateLimit", () => ({ rateLimitAllow: mocks.allow, clientIp: () => "test" }));
vi.mock("@/lib/notifyOutbox", () => ({ drainNotifications: vi.fn() }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: vi.fn() }));
import { POST } from "@/app/api/delivery/heart/route";
import { STAMPS } from "@/lib/wedding";

const token = "a".repeat(32);
const groupId = "123e4567-e89b-42d3-a456-426614174000";
const member = { id: "member-a", name: "초대본인", phone: "010-1111-2222", group_id: groupId, groups: { slug: "friends" } };
function query(data: unknown) {
  const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  q.select.mockReturnValue(q); q.eq.mockReturnValue(q); q.maybeSingle.mockResolvedValue({ data });
  return q;
}
const request = (body: object = {}) => POST(new Request("http://localhost/api/delivery/heart", {
  method: "POST", body: JSON.stringify({ name: "직접입력", sido: "서울", sub: "강남구", stamp: STAMPS[0], ...body }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.allow.mockResolvedValue(true);
  mocks.from.mockReturnValue(query(member));
  mocks.rpc.mockResolvedValue({ data: [{ participant_id: "participant", manage_token: "manage" }], error: null });
});

describe("heart invitation identity", () => {
  it("passes token to atomic RPC, uses server identity and preserves personal kind/privacy", async () => {
    const response = await request({ inviteToken: token, isPrivate: true, showRegion: false });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("send_heart_v3", expect.objectContaining({
      p_invite_token: token, p_name: "초대본인", p_phone: null, p_group_id: null,
      p_is_private: true, p_show_region: false, p_display_mode: "anon",
    }));
    expect(await response.json()).toEqual({ manage_token: "manage" });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("keeps explicitly entered contact without replacing invite identity", async () => {
    expect((await request({ inviteToken: token, phone: "010-9999-8888" })).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("send_heart_v3", expect.objectContaining({ p_phone: "010-9999-8888", p_invite_token: token }));
    mocks.rpc.mockClear();
    expect((await request({ inviteToken: token, phone: "typo" })).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("supports ordinary and groupless guests without required contact", async () => {
    expect((await request()).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("send_heart_v3", expect.objectContaining({ p_name: "직접입력", p_invite_token: null, p_phone: null }));
    mocks.from.mockReturnValue(query({ ...member, group_id: null, groups: null }));
    expect((await request({ inviteToken: token })).status).toBe(200);
  });
  it("rejects invalid, unknown and revoked tokens before creating anything", async () => {
    for (const inviteToken of ["invalid", false, {}]) expect((await request({ inviteToken })).status).toBe(401);
    mocks.from.mockReturnValue(query(null));
    expect((await request({ inviteToken: token })).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("checks claimed group and refuses cross-group submissions", async () => {
    mocks.from.mockReturnValueOnce(query(member)).mockReturnValueOnce(query({ id: "other", slug: "other" }));
    expect((await request({ inviteToken: token, groupId })).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.from.mockReturnValueOnce(query(member)).mockReturnValueOnce(query({ id: groupId, slug: "friends" }));
    expect((await request({ inviteToken: token, groupId })).status).toBe(200);
  });
  it("does not report transaction failure as success or retry the write", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "invite_identity_mismatch" } });
    expect((await request({ inviteToken: token })).status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "invite_invalid" } });
    expect((await request({ inviteToken: token })).status).toBe(401);
  });
});
