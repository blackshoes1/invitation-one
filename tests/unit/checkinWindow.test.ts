import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCheckinWindow, checkEventKey, digits } from "@/lib/checkinServer";

/** site_settings 를 흉내내는 최소 스텁 (외부 접근 없음) */
function stub(rows: { key: string; value: unknown }[]): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({ data: rows, error: null }),
      }),
    }),
  } as unknown as SupabaseClient;
}
const iso = (offsetMin: number) => new Date(Date.now() + offsetMin * 60_000).toISOString();

describe("getCheckinWindow", () => {
  it("checkin_enabled 가 true 가 아니면 not_enabled", async () => {
    expect(await getCheckinWindow(stub([]))).toBe("checkin_not_enabled");
    expect(await getCheckinWindow(stub([{ key: "checkin_enabled", value: "true" }]))).toBe(
      "checkin_not_enabled"
    );
  });
  it("개방 전 / 마감 후 / 창 안", async () => {
    const on = { key: "checkin_enabled", value: true };
    expect(
      await getCheckinWindow(stub([on, { key: "checkin_open_at", value: iso(+30) }]))
    ).toBe("checkin_not_open");
    expect(
      await getCheckinWindow(stub([on, { key: "checkin_close_at", value: iso(-30) }]))
    ).toBe("checkin_closed");
    expect(
      await getCheckinWindow(
        stub([on, { key: "checkin_open_at", value: iso(-30) }, { key: "checkin_close_at", value: iso(+30) }])
      )
    ).toBe("ok");
  });
  it("시각 값이 없거나 잘못되면 enabled 만으로 ok", async () => {
    expect(
      await getCheckinWindow(stub([{ key: "checkin_enabled", value: true }, { key: "checkin_open_at", value: "garbage" }]))
    ).toBe("ok");
  });
});

describe("checkEventKey / digits", () => {
  it("행사 키 미설정이면 unset(fail-closed), 불일치 mismatch, 일치 ok", () => {
    delete process.env.CHECKIN_EVENT_KEY;
    expect(checkEventKey("x")).toBe("unset");
    process.env.CHECKIN_EVENT_KEY = "secret-key";
    expect(checkEventKey("nope")).not.toBe("ok");
    expect(checkEventKey("secret-key")).toBe("ok");
  });
  it("digits 는 숫자만 남김", () => {
    expect(digits("010-1234-5678")).toBe("01012345678");
  });
});
