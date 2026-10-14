import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), order: vi.fn(), single: vi.fn(), guard: vi.fn(), audit: vi.fn(), rate: vi.fn(), config: vi.fn(), sms: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: mocks.rpc, from: () => { const q = { select: () => q, eq: () => q, in: () => q, order: mocks.order, maybeSingle: mocks.single }; return q; } } }));
vi.mock("@/lib/adminAuth", () => ({ adminGuard: mocks.guard }));
vi.mock("@/lib/privacyAudit", async original => ({ ...await original<typeof import("@/lib/privacyAudit")>(), recordAccess: mocks.audit }));
vi.mock("@/lib/rateLimit", () => ({ rateLimitAllow: mocks.rate, clientIp: () => "127.0.0.1" }));
vi.mock("@/lib/sms", () => ({ sendSms: mocks.sms, smsConfigProblem: mocks.config }));
vi.mock("@/lib/wedding", () => ({ INVITATION_KEY: "test-key", GUEST_GUIDE_START: new Date("2026-10-15T00:00:00+09:00") }));
import { POST as adminPost } from "@/app/api/admin/guest-guide/route";
import { POST as guestPost } from "@/app/api/guest-guide/route";
import { guideToken, guideReviewToken, type GuideRecipient } from "@/lib/guestGuideNotice";
import { hashManageToken } from "@/lib/manageToken";
const id = "10000000-0000-4000-8000-000000000001";
let row: GuideRecipient;
const req = (body: object) => new Request("http://localhost/api/guest-guide", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T09:00:00+09:00")); vi.stubEnv("APP_SIGNING_SECRET", "test-only-guide-key"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.invalid");
  vi.clearAllMocks(); mocks.guard.mockResolvedValue(null); mocks.audit.mockResolvedValue(true); mocks.rate.mockResolvedValue(true); mocks.config.mockReturnValue(null); mocks.rpc.mockResolvedValue({ data: null, error: null }); mocks.sms.mockResolvedValue({ ok: true });
  row = { id, name: "테스트하객", phone: "010-1111-2222", side: "groom", guide_token_hash: null, guide_issued_at: "2026-10-14T00:00:00Z", guide_confirmed_at: null, guide_sms_status: null, guide_sms_request_id: null, guide_sms_attempted_at: null, guide_sms_sent_at: null };
  row.guide_token_hash = hashManageToken(guideToken(id, row.guide_issued_at!)!);
  mocks.order.mockImplementation(async () => ({ data: [row], error: null }));
  mocks.single.mockImplementation(async () => ({ data: { name: row.name, guide_confirmed_at: row.guide_confirmed_at }, error: null }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const token = () => guideToken(id, row.guide_issued_at!)!;
const send = (extra = {}) => adminPost(req({ action: "send", id, reviewToken: guideReviewToken(row), confirm: true, ...extra }));
it("prepares a personal message without sending SMS or rotating the entry QR", async () => {
  const data = await (await adminPost(req({ action: "prepare", ids: [id] }))).json();
  expect(data.recipients[0].url).toBe(`https://example.invalid/guest-guide?t=${token()}`);
  expect(data.recipients[0].phoneMasked).toBe("010-****-2222");
  expect(JSON.stringify(data)).not.toContain("010-1111-2222"); expect(mocks.sms).not.toHaveBeenCalled();
  expect(mocks.rpc).toHaveBeenCalledWith("issue_guest_guide_v1", expect.objectContaining({ p_request: null }));
});
it("rejects missing approval, changed review and unauthenticated administrators before sending", async () => {
  expect((await send({ confirm: false })).status).toBe(400);
  expect((await send({ reviewToken: "stale" })).status).toBe(409);
  mocks.guard.mockResolvedValue(new Response(null, { status: 401 })); expect((await send()).status).toBe(401);
  expect(mocks.sms).not.toHaveBeenCalled();
});
it("claims a request before provider submission and only records acceptance afterwards", async () => {
  expect(await (await send()).json()).toEqual({ id, status: "accepted" });
  expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["issue_guest_guide_v1", "complete_guest_guide_sms_v1"]);
  expect(mocks.sms).toHaveBeenCalledWith(row.phone, expect.stringContaining(`/guest-guide?t=${token()}`));
  expect(mocks.rpc.mock.calls[1][1].p_status).toBe("accepted");
});
it("does not submit twice when another request has already claimed the attendee", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "send_in_progress" } });
  expect((await send()).status).toBe(409); expect(mocks.sms).not.toHaveBeenCalled();
});
it("stores an uncertain provider result without pretending it failed or succeeded", async () => {
  mocks.sms.mockResolvedValue({ ok: false, unknown: true });
  expect(await (await send()).json()).toEqual({ id, status: "unknown" });
  expect(mocks.sms).toHaveBeenCalledOnce();
});
it("reports a result-recording failure without blindly retrying the provider", async () => {
  mocks.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "unavailable" } });
  expect((await send()).status).toBe(503); expect(mocks.sms).toHaveBeenCalledOnce();
});
it("link preview only loads minimal information and never checks the guest in", async () => {
  const res = await guestPost(req({ action: "load", token: token() }));
  expect(await res.json()).toEqual({ name: row.name, confirmedAt: null, open: true });
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(res.headers.get("Cache-Control")).toContain("no-store");
});
it("blocks confirmation before October 15 without calling the writer", async () => {
  vi.setSystemTime(new Date("2026-10-14T23:59:59+09:00"));
  expect((await guestPost(req({ action: "confirm", token: token() }))).status).toBe(409);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("stores explicit confirmation before supplying the new invitation address", async () => {
  mocks.rpc.mockResolvedValue({ data: "2026-10-15T00:00:00Z", error: null });
  const res = await guestPost(req({ action: "confirm", token: token() })); const data = await res.json();
  expect(data.nextUrl).toBe("/?key=test-key"); expect(res.headers.get("Set-Cookie")).toContain("inv_key=test-key");
  expect(mocks.rpc).toHaveBeenCalledWith("confirm_guest_guide_v1", { p_hash: hashManageToken(token()) });
});
it("does not supply a destination after a failed confirmation", async () => {
  mocks.rpc.mockResolvedValue({ error: { message: "unavailable" } });
  const res = await guestPost(req({ action: "confirm", token: token() }));
  expect(res.status).toBe(503); expect(await res.text()).not.toContain("nextUrl");
});
