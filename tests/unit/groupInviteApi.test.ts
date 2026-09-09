import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/adminAuth", () => ({ adminGuard: mocks.guard }));
import { POST } from "@/app/api/admin/groups/[id]/members/invite/route";
import { inviteTokenHash, recoverInviteToken, reusableInviteToken } from "@/lib/reusableInvite";

function query(data: unknown, error: unknown = null) {
  const q = {
    select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), update: vi.fn(), maybeSingle: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
  };
  for (const fn of [q.select, q.eq, q.is, q.order, q.update, q.maybeSingle]) fn.mockReturnValue(q);
  return q;
}
const member = { id: "member-a", name: "테스트", phone: "010-1234-5678",
  invited_at: "2026-09-09T01:00:00.123Z", invite_token_hash: null as string | null };
const request = (body: unknown = { member_id: member.id }) => POST(
  new Request("https://example.invalid/api/admin/groups/group-a/members/invite", {
    method: "POST", body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "group-a" }) },
);
function reads(rows: unknown[]) {
  const group = query({ slug: "friends" });
  const roster = query(rows);
  mocks.from.mockReturnValueOnce(group).mockReturnValueOnce(roster);
  return { group, roster };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_SIGNING_SECRET", "test-only-signing-secret");
  mocks.guard.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("group invite copy and rotation", () => {
  it("requires admin access before reading or issuing anything", async () => {
    mocks.guard.mockResolvedValue(new Response(null, { status: 401 }));
    expect((await request()).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects ambiguous/bad targets and bulk rotation", async () => {
    for (const body of [null, {}, { all: true, member_id: member.id },
      { all: "yes", member_id: member.id }, { all: true, rotate: true }, { member_id: member.id, rotate: "yes" }]) {
      expect((await request(body)).status).toBe(400);
    }
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("issues a compatible token and only stores a hash; copy after reload is identical", async () => {
    const { roster } = reads([{ ...member, invited_at: null }]);
    const write = query({ id: member.id });
    mocks.from.mockReturnValueOnce(write);
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const { links } = await response.json();
    const token = new URL(links[0].url).searchParams.get("i")!;
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(new URL(links[0].personalUrl).searchParams.get("i")).toBe(token);
    const saved = write.update.mock.calls[0][0];
    expect(saved.invite_token_hash).toBe(inviteTokenHash(token));
    expect(JSON.stringify(saved)).not.toContain(token);
    expect(write.is).toHaveBeenCalledWith("invite_token_hash", null);
    expect(roster.eq).toHaveBeenCalledWith("group_id", "group-a");
    expect(roster.eq).toHaveBeenCalledWith("id", member.id);

    mocks.from.mockReset();
    reads([{ ...member, ...saved, invited_at: saved.invited_at.replace("Z", "+00:00") }]);
    const copied = await (await request()).json();
    expect(copied.links[0].url).toBe(links[0].url);
    expect(mocks.from).toHaveBeenCalledTimes(2); // read only on recopy
  });
  it("rotates only explicitly and guards against concurrent token/phone changes", async () => {
    const oldToken = reusableInviteToken(member.id, member.invited_at)!;
    const current = { ...member, invite_token_hash: inviteTokenHash(oldToken) };
    reads([current]);
    const write = query({ id: member.id });
    mocks.from.mockReturnValueOnce(write);
    const { links } = await (await request({ member_id: member.id, rotate: true })).json();
    expect(new URL(links[0].url).searchParams.get("i")).not.toBe(oldToken);
    expect(write.eq).toHaveBeenCalledWith("invite_token_hash", current.invite_token_hash);
    expect(write.eq).toHaveBeenCalledWith("phone", member.phone);
    expect(write.eq).toHaveBeenCalledWith("group_id", "group-a");
  });
  it("never silently replaces legacy links; explicit rotation still works", async () => {
    const legacy = { ...member, invite_token_hash: inviteTokenHash("a".repeat(32)) };
    reads([legacy]);
    const response = await request();
    expect(response.status).toBe(409);
    expect((await response.json()).skipped[0].reason).toContain("링크 재발급");
    expect(mocks.from).toHaveBeenCalledTimes(2);
    reads([legacy]);
    mocks.from.mockReturnValueOnce(query({ id: member.id }));
    expect((await request({ member_id: member.id, rotate: true })).status).toBe(200);
  });
  it("bulk copy keeps valid links and reports missing phones and legacy members", async () => {
    const token = reusableInviteToken(member.id, member.invited_at)!;
    reads([
      { ...member, invite_token_hash: inviteTokenHash(token) },
      { ...member, id: "missing", phone: null },
      { ...member, id: "legacy", invite_token_hash: inviteTokenHash("b".repeat(32)) },
    ]);
    const { links, skipped } = await (await request({ all: true })).json();
    expect(links).toHaveLength(1);
    expect(skipped.map((s: { id: string }) => s.id)).toEqual(["missing", "legacy"]);
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });
  it("does not return an unsaved link after DB failure or concurrent modification", async () => {
    for (const error of [null, { message: "db unavailable" }]) {
      reads([member]);
      mocks.from.mockReturnValueOnce(query(null, error));
      const response = await request();
      expect(response.status).toBe(409);
      expect((await response.json()).links).toEqual([]);
    }
  });
  it("missing key fails closed", async () => {
    vi.stubEnv("APP_SIGNING_SECRET", "");
    vi.stubEnv("ADMIN_PASSWORD", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect((await request()).status).toBe(503);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not disguise group or roster DB errors as absence", async () => {
    mocks.from.mockReturnValueOnce(query(null, { message: "offline" }));
    expect((await request()).status).toBe(503);
    mocks.from.mockReturnValueOnce(query({ slug: "friends" }))
      .mockReturnValueOnce(query(null, { message: "offline" }));
    expect((await request()).status).toBe(503);
  });
});

describe("reusable invite derivation", () => {
  it("normalizes timestamps and binds member, issuance and key", () => {
    const key = Buffer.from("test-key");
    const token = reusableInviteToken("m1", member.invited_at, key)!;
    expect(reusableInviteToken("m1", "2026-09-09T10:00:00.123+09:00", key)).toBe(token);
    expect(reusableInviteToken("m2", member.invited_at, key)).not.toBe(token);
    expect(reusableInviteToken("m1", "2026-09-09T01:00:00.124Z", key)).not.toBe(token);
    expect(reusableInviteToken("m1", member.invited_at, Buffer.from("other"))).not.toBe(token);
    expect(reusableInviteToken("m1", "invalid", key)).toBeNull();
    expect(reusableInviteToken("m1", member.invited_at, null)).toBeNull();
    expect(recoverInviteToken({ id: "m1", invited_at: member.invited_at,
      invite_token_hash: inviteTokenHash(token) }, key)).toBe(token);
    expect(recoverInviteToken({ id: "m1", invited_at: member.invited_at,
      invite_token_hash: inviteTokenHash(token) }, Buffer.from("rotated-key"))).toBeNull();
  });
});
