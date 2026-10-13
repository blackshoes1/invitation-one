import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), sms: vi.fn(), config: vi.fn(), rate: vi.fn(), audit: vi.fn(), deleteEq: vi.fn() }));
const tasks = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => tasks.push(task) }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("@/lib/sms", () => ({ sendSms: mocks.sms, smsConfigProblem: mocks.config }));
vi.mock("@/lib/rateLimit", () => ({ rateLimitAllow: mocks.rate, clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/privacyAudit", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/privacyAudit")>(), recordAccess: mocks.audit }));
import { requestIdentityCode, verifyIdentityCode } from "@/lib/guestIdentity";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy";
const id = "10000000-0000-4000-8000-000000000001";
const req = (body: object) => new Request("http://localhost/api/identity/request", { method: "POST", body: JSON.stringify(body) });
const body = { name: "Test Person", phone: "010-1111-2222", purpose: "badge", consent: PRIVACY_POLICY_VERSION };
beforeEach(() => {
  tasks.length = 0;
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T09:00:00+09:00"));
  vi.stubEnv("APP_SIGNING_SECRET", "test-only-signing-key"); vi.clearAllMocks();
  mocks.config.mockReturnValue(null); mocks.rate.mockResolvedValue(true); mocks.audit.mockResolvedValue(true);
  mocks.sms.mockResolvedValue({ ok: true }); mocks.rpc.mockResolvedValue({ data: "01011112222", error: null });
  mocks.deleteEq.mockResolvedValue({ error: null }); mocks.from.mockReturnValue({ delete: () => ({ eq: mocks.deleteEq }) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
it("binds the code to a challenge and returns no code, phone or account information", async () => {
  const res = await requestIdentityCode(req(body)); const data = await res.json();
  expect(res.status).toBe(200); expect(data).toEqual({ challengeId: expect.any(String), expiresIn: 300, message: expect.any(String) });
  const args = mocks.rpc.mock.calls[0][1];
  expect(args.p_phone).toBe("01011112222"); expect(args.p_phone_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(args.p_code_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(mocks.sms).not.toHaveBeenCalled();
  await Promise.all(tasks.map(task => task()));
  expect(mocks.sms).toHaveBeenCalledOnce();
  expect(JSON.stringify(data)).not.toMatch(/010|Test Person|verificationToken/);
});
it("uses the same public response for unknown names without sending SMS", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  const data = await (await requestIdentityCode(req(body))).json();
  await Promise.all(tasks.map(task => task()));
  expect(Object.keys(data).sort()).toEqual(["challengeId", "expiresIn", "message"]); expect(mocks.sms).not.toHaveBeenCalled();
});
it("revokes a challenge on SMS failure without leaking provider details", async () => {
  mocks.sms.mockResolvedValue({ ok: false, error: "Private phone and code" });
  const res = await requestIdentityCode(req(body));
  await Promise.all(tasks.map(task => task()));
  expect(res.status).toBe(200); expect(mocks.deleteEq).toHaveBeenCalledWith("id", expect.any(String));
  expect(await res.text()).not.toContain("Private");
});
it("fails closed if SMS, rate limits, or auditing is unavailable", async () => {
  mocks.config.mockReturnValue({ code: "missing" }); expect((await requestIdentityCode(req(body))).status).toBe(503);
  mocks.config.mockReturnValue(null); mocks.rate.mockResolvedValue(false); expect((await requestIdentityCode(req(body))).status).toBe(429);
  mocks.rate.mockResolvedValue(true); mocks.audit.mockResolvedValue(false); expect((await requestIdentityCode(req(body))).status).toBe(503);
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.sms).not.toHaveBeenCalled();
});
it("requires a current disclosure acknowledgement and rejects invalid phones", async () => {
  expect((await requestIdentityCode(req({ ...body, consent: undefined }))).status).toBe(400);
  expect((await requestIdentityCode(req({ ...body, phone: "2222" }))).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not issue proof for an invalid or exhausted code", async () => {
  mocks.rpc.mockResolvedValue({ data: { ok: false }, error: null });
  const res = await verifyIdentityCode(req({ challengeId: id, code: "000001" }));
  expect(res.status).toBe(401); expect(await res.text()).not.toContain("verificationToken");
});
it("only returns a random proof after atomic database verification; stores its hash", async () => {
  mocks.rpc.mockResolvedValue({ data: { ok: true, purpose: "rsvp", result: null }, error: null });
  const res = await verifyIdentityCode(req({ challengeId: id, code: "123456" })); const data = await res.json();
  expect(data.verificationToken).toMatch(/^[a-f0-9]{32}$/);
  const args = mocks.rpc.mock.calls[0][1]; expect(args.p_ticket_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(args.p_ticket_hash).not.toBe(data.verificationToken); expect(args.p_code_hash).not.toContain("123456");
});
it("stops collection at exactly the retention deadline", async () => {
  vi.setSystemTime(new Date("2026-11-17T11:00:00+09:00"));
  expect((await requestIdentityCode(req(body))).status).toBe(410);
  expect((await verifyIdentityCode(req({ challengeId: id, code: "123456" }))).status).toBe(410);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
