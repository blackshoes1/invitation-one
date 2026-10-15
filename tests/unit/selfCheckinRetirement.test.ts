import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({
  isAdminConfigured: true,
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock("@/lib/adminAuth", () => ({ adminGuard: mocks.guard }));
vi.mock("@/lib/guestIdentity", () => ({ identityNameHash: () => "name-hash", identityPhoneHash: () => "phone-hash" }));

import { GET as getPass, POST as postPass } from "@/app/api/checkin/pass/route";
import { POST as postCommon } from "@/app/api/checkin/common/route";
import { POST as postSearch } from "@/app/api/checkin/search/route";
import { POST as issuePass } from "@/app/api/admin/rsvp/[id]/issue-pass/route";
import { GET as exportRsvps } from "@/app/api/admin/rsvp-export/route";
import { POST as adminCheckin } from "@/app/api/admin/checkins/route";
import { POST as submitRsvp } from "@/app/api/rsvp/route";
import { rsvpSubmitToken } from "@/lib/checkinServer";

const id = "10000000-0000-4000-8000-000000000001";
const request = (path: string, body: object) => new Request(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T09:00:00+09:00"));
  vi.stubEnv("ADMIN_PASSWORD", "test-only-admin");
  vi.stubEnv("NEXT_PUBLIC_INVITATION_KEY", "test-only-invite");
  mocks.guard.mockResolvedValue(null);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("retired self checkin", () => {
  it("rejects every public read/write entry without accessing guest data", async () => {
    for (const handler of [getPass, postPass, postCommon, postSearch]) {
      const res = await handler();
      expect(res.status).toBe(410);
      expect(await res.json()).toEqual({ error: "self_checkin_disabled", result: "self_checkin_disabled" });
      expect(res.headers.get("Cache-Control")).toContain("no-store");
      expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    }
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("stops issuing or exporting guest passes without rotating existing records", async () => {
    expect((await issuePass(request(`/api/admin/rsvp/${id}/issue-pass`, {}))).status).toBe(410);
    expect((await exportRsvps(new Request("http://localhost/api/admin/rsvp-export?type=pass"))).status).toBe(410);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps manual administrator arrival records available", async () => {
    const inserted = vi.fn();
    const row = { id: "arrival-1", rsvp_id: id, actual_party_size: 2, meal_count: 2, created_at: "2026-10-18T01:00:00Z" };
    mocks.from.mockImplementation((table: string) => {
      if (table === "rsvp") {
        const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: { id, name: "하객", side: "groom", attending: true, companion_count: 1 } }) };
        return query;
      }
      return { insert: (fields: object) => { inserted(fields); return { select: () => ({ single: async () => ({ data: row, error: null }) }) }; } };
    });
    const res = await adminCheckin(request("/api/admin/checkins", { rsvpId: id, actualPartySize: 2 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "checked_in", checkin: row });
    expect(inserted).toHaveBeenCalledWith(expect.objectContaining({ rsvp_id: id, source: "admin", actual_party_size: 2, status: "active" }));
  });

  it("continues accepting RSVP attendance without exposing legacy pass tokens", async () => {
    mocks.from.mockReturnValue({ select: async () => ({ count: 1 }) });
    mocks.rpc.mockResolvedValue({ data: [{ result: "inserted", rsvp_id: id, pass_token: "legacy-secret-pass" }], error: null });
    const res = await submitRsvp(request("/api/rsvp", {
      submitToken: rsvpSubmitToken(), verificationToken: "a".repeat(32), name: "하객", phone: "010-1111-2222", attending: true, companionCount: 1,
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "inserted" });
    expect(mocks.rpc).toHaveBeenCalledWith("submit_rsvp_verified_v1", expect.objectContaining({ p_attending: true, p_companions: 1 }));
  });
});
