import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: () => ({ insert: mocks.insert }) } }));
import { recordAccess, privacyHash } from "@/lib/privacyAudit";
beforeEach(() => { vi.stubEnv("APP_SIGNING_SECRET", "test-only-secret"); vi.clearAllMocks(); mocks.insert.mockResolvedValue({ error: null }); });
it("omits raw session, IP, query tokens and body data", async () => {
  const token = "a".repeat(64);
  const req = new Request("http://localhost/api/admin/participants/10000000-0000-4000-8000-000000000001?phone=01011112222&t=private-token", {
    method: "POST", headers: { cookie: `admin_session=${token}`, "x-forwarded-for": "192.0.2.5" }, body: '{"name":"Private Person","password":"Private password"}',
  });
  expect(await recordAccess(req, "change_request", "allowed")).toBe(true);
  const row = mocks.insert.mock.calls[0][0];
  expect(row.resource).toBe("/api/admin/participants/:id"); expect(row.actor_hash).toBe(privacyHash(`session:${token}`));
  expect(JSON.stringify(row)).not.toMatch(/01011112222|private-token|192\.0\.2\.5|Private Person|Private password/);
});
it("reports database failure to callers so sensitive reads can fail closed", async () => {
  mocks.insert.mockResolvedValue({ error: { message: "unavailable" } });
  expect(await recordAccess(new Request("http://localhost/api/admin/groups"), "read_request", "allowed")).toBe(false);
});
