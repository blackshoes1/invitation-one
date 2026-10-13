import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), password: vi.fn(), rpc: vi.fn(), audit: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/adminAuth", () => ({ adminGuard: mocks.guard, verifyAdminPassword: mocks.password }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/privacyAudit", () => ({ adminActor: () => "hashed-session", recordAccess: mocks.audit }));
vi.mock("@/lib/rateLimit", () => ({ rateLimitAllow: mocks.rate }));
import { POST, PATCH } from "@/app/api/admin/privacy/route";
const body = { confirm: "개인정보 파기", acknowledgeExternalCopies: true, fingerprint: "a".repeat(64), password: "private-password" };
const req = (extra = {}) => new Request("http://localhost/api/admin/privacy", { method: "POST", body: JSON.stringify({ ...body, ...extra }) });
beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue(null); mocks.password.mockReturnValue(true); mocks.rate.mockResolvedValue(true); mocks.audit.mockResolvedValue(true); mocks.rpc.mockResolvedValue({ data: { id: "receipt" }, error: null }); });
it("requires both the admin session and a fresh password check", async () => {
  mocks.guard.mockResolvedValue(new Response(null, { status: 401 })); expect((await POST(req())).status).toBe(401);
  mocks.guard.mockResolvedValue(null); mocks.password.mockReturnValue(false); expect((await POST(req())).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("requires explicit review of targets and external copies", async () => {
  expect((await POST(req({ confirm: "" }))).status).toBe(400);
  expect((await POST(req({ acknowledgeExternalCopies: false }))).status).toBe(400);
  expect((await POST(req({ fingerprint: "" }))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("limits repeated password checks and does not call purge when limited", async () => {
  mocks.rate.mockResolvedValue(false); expect((await POST(req())).status).toBe(429);
  expect(mocks.password).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("reports early or changed targets without pretending the purge succeeded", async () => {
  for (const message of ["retention_not_expired", "targets_changed"]) {
    mocks.rpc.mockResolvedValue({ error: { message } }); const res = await POST(req());
    expect(res.status).toBe(409); expect(await res.text()).not.toContain("receipt");
  }
});
it("returns a receipt and requires relogin without sending the password to SQL", async () => {
  const res = await POST(req()); expect(await res.json()).toEqual({ receipt: { id: "receipt" }, reauthenticationRequired: true });
  expect(mocks.rpc).toHaveBeenCalledWith("purge_operational_privacy_v1", { p_fingerprint: body.fingerprint });
});
it("records external completion separately and rejects unknown keys", async () => {
  const call = (key: string) => PATCH(new Request("http://localhost/api/admin/privacy", { method: "PATCH", body: JSON.stringify({ key, done: true }) }));
  expect((await call("unrecognised")).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ error: { message: "purge_required" } }); expect((await call("sms")).status).toBe(409);
  mocks.rpc.mockResolvedValue({ data: { sms: true } }); expect(await (await call("sms")).json()).toEqual({ externalChecks: { sms: true } });
});
