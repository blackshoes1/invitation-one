import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/adminAuth", () => ({ adminGuard: async () => null }));
import { GET } from "@/app/api/admin/invitees/route";
function query(data: unknown, error: unknown = null) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "is"]) q[method] = vi.fn(() => q);
  for (const method of ["order", "in"]) q[method] = vi.fn(async () => ({ data, error }));
  return q;
}
beforeEach(() => vi.clearAllMocks());
it("cancellation clears applied; heart history stays separate and reordering restores the badge", async () => {
  for (const status of ["취소", "대기중", "확정", "완료"]) {
    mocks.from.mockReturnValueOnce(query([{ id: "member", name: "테스트" }]))
      .mockReturnValueOnce(query([
        { group_member_id: "member", group_id: null, type: "마음배송", delivery: null },
        { group_member_id: "member", group_id: null, type: "직접배달", delivery: { status: "취소" } },
        { group_member_id: "member", group_id: null, type: "직접배달", delivery: { status } },
      ]));
    const response = await GET(new Request("http://localhost/api/admin/invitees"));
    expect((await response.json()).members[0]).toMatchObject({
      applied: status !== "취소", personal: status !== "취소",
    });
  }
});
it("does not misreport a failed participation query as no applications", async () => {
  mocks.from.mockReturnValueOnce(query([{ id: "member" }])).mockReturnValueOnce(query(null, { message: "DB unavailable" }));
  expect((await GET(new Request("http://localhost/api/admin/invitees"))).status).toBe(500);
});
