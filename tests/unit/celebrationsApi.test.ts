import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), allow: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ isAdminConfigured: true, supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/rateLimit", () => ({ rateLimitAllow: mocks.allow, clientIp: () => "test" }));
vi.mock("@/lib/notifyOutbox", () => ({ drainNotifications: vi.fn() }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: vi.fn() }));
import { POST } from "@/app/api/celebrations/route";
const request = (body: unknown) => POST(new Request("http://localhost/api/celebrations", { method: "POST", body: JSON.stringify(body) }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.allow.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: [{ participant_id: "id", manage_token: "private-token" }], error: null });
});
it("accepts only name/message, defaults anonymous and never invents a map location or identity", async () => {
  const response = await request({ name: " 홍길동 ", message: " 축하합니다 ", groupId: "forged", inviteToken: "forged" });
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("send_heart_v3", expect.objectContaining({
    p_name: "홍길동", p_message: "축하합니다", p_region: "지역 미입력", p_show_region: false,
    p_display_mode: "anon", p_is_private: false, p_group_id: null, p_invite_token: null, p_phone: null, p_attendance: null,
  }));
  expect(await response.json()).toEqual({ ok: true });
});
it("honors private messages and validates optional map location", async () => {
  expect((await request({ name: "홍길동", message: "축하", visibility: "private", sido: "서울", sub: "강남구" })).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("send_heart_v3", expect.objectContaining({ p_is_private: true, p_region: "서울 강남구" }));
});
it.each([null, [], {}, { name: {}, message: "축하" }, { name: "김", message: "축하" },
  { name: "홍길동", message: " " }, { name: "홍길동", message: "x".repeat(501) },
  { name: "홍길동", message: "축하", visibility: "unknown" },
  { name: "홍길동", message: "축하", sido: "서울", sub: "가짜구" },
  { name: "홍길동", message: "축하", sido: "서울" }])("rejects invalid input %j without writing", async (body) => {
  expect((await request(body)).status).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
});
it("shares the heart rate limit and does not claim success on database errors", async () => {
  mocks.allow.mockResolvedValue(false);
  expect((await request({ name: "홍길동", message: "축하" })).status).toBe(429);
  expect(mocks.allow).toHaveBeenCalledWith("heart:create:test", 20, 600);
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.allow.mockResolvedValue(true); mocks.rpc.mockResolvedValue({ data: null, error: { message: "internal details" } });
  const response = await request({ name: "홍길동", message: "축하" });
  expect(response.status).toBe(500); expect(await response.text()).not.toContain("internal details");
});
