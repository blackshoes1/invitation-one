import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), drain: vi.fn(), after: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ isAdminConfigured: true, supabaseAdmin: { rpc: mocks.rpc } }));
vi.mock("@/lib/rateLimit", () => ({ rateLimitAllow: async () => true, clientIp: () => "test" }));
vi.mock("@/lib/notifyOutbox", () => ({ drainNotifications: mocks.drain }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));
import { POST as create } from "@/app/api/delivery/create/route";
import { POST as join } from "@/app/api/delivery/join/route";
import { POST as heart } from "@/app/api/delivery/heart/route";
import { POST as accept } from "@/app/api/delivery/group/accept/route";
import { POST as celebrate } from "@/app/api/celebrations/route";
import { STAMPS } from "@/lib/wedding";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: [{ result: "ok", participant_id: "p", manage_token: "t" }], error: null });
});
const contact = { name: "테스트", phone: "010-1234-5678" };
describe("response background work remains alive until the notification checkpoint finishes", () => {
  for (const [name, post, body] of [
    ["create", create, { ...contact, location: "서울 강남구", date: "2026-09-14", time: "저녁" }],
    ["join", join, { ...contact, deliveryId: "123e4567-e89b-42d3-a456-426614174000" }],
    ["heart", heart, { ...contact, sido: "서울", sub: "강남구", stamp: STAMPS[0] }],
    ["accept", accept, { ...contact, slug: "friends" }],
    ["celebrations", celebrate, { name: "테스트", message: "축하합니다" }],
  ] as const) {
    it(name, async () => {
      let checkpoint!: () => void;
      mocks.drain.mockReturnValue(new Promise<void>((resolve) => { checkpoint = resolve; }));
      const response = await post(new Request("http://localhost/test", { method: "POST", body: JSON.stringify(body) }));
      expect(response.status).toBe(200);
      expect(mocks.after).toHaveBeenCalledTimes(1);
      const background = mocks.after.mock.calls[0][0]() as Promise<void>;
      expect(background).toBeInstanceOf(Promise);
      let finished = false;
      void background.then(() => { finished = true; });
      await Promise.resolve();
      expect(finished).toBe(false);
      checkpoint();
      await background;
      expect(finished).toBe(true);
      expect(mocks.drain).toHaveBeenCalledTimes(1);
    });
  }
});
