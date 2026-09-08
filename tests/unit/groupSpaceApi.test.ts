import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), allow: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/rateLimit", () => ({ rateLimitAllow: mocks.allow, clientIp: () => "test" }));
import { POST } from "@/app/api/delivery/group-space/route";

function query(data: unknown, error: unknown = null) {
  const q = {
    select: vi.fn(), eq: vi.fn(), neq: vi.fn(), order: vi.fn(), upsert: vi.fn(),
    maybeSingle: vi.fn(), single: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
  };
  for (const fn of [q.select, q.eq, q.neq, q.order, q.upsert, q.maybeSingle, q.single]) fn.mockReturnValue(q);
  return q;
}
const token = "a".repeat(32);
const me = { id: "self", name: "본인", group_id: "group-a" };
const request = (body: object) => POST(new Request("http://localhost/api/delivery/group-space", {
  method: "POST", body: JSON.stringify({ token, action: "load", ...body }),
}));
beforeEach(() => { vi.clearAllMocks(); mocks.allow.mockResolvedValue(true); });

describe("group space API", () => {
  it("rejects invalid and unknown tokens, with no-store even on errors", async () => {
    const bad = await request({ token: "not-a-token" });
    expect(bad.status).toBe(401);
    expect(bad.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.from.mockReturnValue(query(null));
    expect((await request({})).status).toBe(401);
  });
  it("rejects groupless invites and rate-limited requests", async () => {
    mocks.from.mockReturnValue(query({ ...me, group_id: null }));
    expect((await request({})).status).toBe(403);
    mocks.allow.mockResolvedValue(false);
    expect((await request({})).status).toBe(429);
  });
  it("saves only token owner's group and member, ignoring spoofed IDs", async () => {
    const write = query(null);
    mocks.from.mockReturnValueOnce(query(me)).mockReturnValueOnce(write);
    expect((await request({ action: "save", attendance: "yes", shareWithGroup: false,
      member_id: "victim", group_id: "group-b" })).status).toBe(200);
    expect(write.upsert).toHaveBeenCalledWith(expect.objectContaining({
      member_id: "self", group_id: "group-a", attendance: "yes", share_with_group: false,
    }), { onConflict: "member_id" });
  });
  it("clearing response also revokes sharing", async () => {
    const write = query(null);
    mocks.from.mockReturnValueOnce(query(me)).mockReturnValueOnce(write);
    await request({ action: "save", attendance: null, shareWithGroup: true });
    expect(write.upsert).toHaveBeenCalledWith(expect.objectContaining({ attendance: null, share_with_group: false }), expect.anything());
  });
  it("rejects invalid consent and attendance instead of coercing", async () => {
    mocks.from.mockReturnValue(query(me));
    expect((await request({ action: "save", attendance: "yes", shareWithGroup: "true" })).status).toBe(400);
    expect((await request({ action: "save", attendance: "invalid", shareWithGroup: false })).status).toBe(400);
  });
  it("does not report a failed write as success", async () => {
    mocks.from.mockReturnValueOnce(query(me)).mockReturnValueOnce(query(null, { message: "db down" }));
    expect((await request({ action: "save", attendance: "maybe", shareWithGroup: false })).status).toBe(503);
  });
  it("filters roster responses on server and scopes every group query", async () => {
    const group = query({ name: "우리 그룹" });
    const roster = query([me, { id: "other", name: "비공개하객" }]);
    const responses = query([{ member_id: "other", attendance: "no", share_with_group: false }]);
    const schedules = query([]);
    mocks.from.mockReturnValueOnce(query(me)).mockReturnValueOnce(group).mockReturnValueOnce(roster)
      .mockReturnValueOnce(responses).mockReturnValueOnce(schedules);
    const result = await request({ group_id: "group-b" });
    const { space } = await result.json();
    expect(space.rosterCount).toBe(2);
    expect(space.sharedAttendingCount).toBe(0);
    expect(space.members).toEqual([{ name: "비＊＊", attendance: null, shared: false }]);
    for (const q of [roster, responses, schedules]) expect(q.eq).toHaveBeenCalledWith("group_id", "group-a");
    expect(schedules.neq).toHaveBeenCalledWith("status", "취소");
    expect(schedules.eq).toHaveBeenCalledWith("hidden", false);
  });
});
