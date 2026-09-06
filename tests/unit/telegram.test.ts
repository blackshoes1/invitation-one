import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 텔레그램 발송 어댑터.
 *
 * 가장 중요한 성질: **절대 예외를 던지지 않는다.**
 * 던지면 드레인 루프를 빠져나가 아웃박스 행이 'sending' 인 채로 갇히고,
 * 3분 스테일 락이 회수해 줄 때까지 아무 흔적 없이 멈춘다
 * (2026-09-06 에 실제로 겪어 16분간 알림이 안 갔다).
 */
const ENV = { TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_CHAT_ID: "999" };

async function loadWithEnv(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/telegram");
}

const origEnv = { ...process.env };
beforeEach(() => vi.restoreAllMocks());
afterEach(() => {
  process.env = { ...origEnv };
});

describe("sendToAdmin", () => {
  it("미설정이면 발송하지 않고 skipped 로 성공 처리", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { sendToAdmin, isTelegramConfigured } = await loadWithEnv({
      TELEGRAM_BOT_TOKEN: undefined,
      TELEGRAM_CHAT_ID: undefined,
    });
    expect(isTelegramConfigured).toBe(false);
    expect(await sendToAdmin("hi")).toEqual({ ok: true, skipped: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("정상 발송 — chat_id 와 본문을 보내고 parse_mode 는 쓰지 않는다", async () => {
    // parse_mode 를 쓰면 하객 이름·배송지의 특수문자 이스케이프를 한 군데만
    // 빠뜨려도 발송이 통째로 실패한다. 평문이 안전하다.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { sendToAdmin } = await loadWithEnv(ENV);

    expect(await sendToAdmin("🛵 새 주문 <홍길동>")).toEqual({ ok: true });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/bot123:abc/sendMessage");
    const body = JSON.parse(String(init.body));
    expect(body.chat_id).toBe("999");
    expect(body.text).toBe("🛵 새 주문 <홍길동>");
    expect(body.parse_mode).toBeUndefined();
  });

  it("HTTP 실패는 던지지 않고 error 로 돌려준다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    );
    const { sendToAdmin } = await loadWithEnv(ENV);
    const r = await sendToAdmin("hi");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("401");
  });

  it("HTTP 200 이어도 ok:false 면 실패로 본다 (텔레그램은 이렇게도 실패를 알린다)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: "chat not found" }), {
        status: 200,
      })
    );
    const { sendToAdmin } = await loadWithEnv(ENV);
    const r = await sendToAdmin("hi");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("chat not found");
  });

  it("네트워크 예외도 던지지 않는다 — 행이 sending 에 갇히는 걸 막는다", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    const { sendToAdmin } = await loadWithEnv(ENV);
    const r = await sendToAdmin("hi");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("ECONNRESET");
  });

  it("4096자 한도를 넘기지 않게 자른다", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { sendToAdmin } = await loadWithEnv(ENV);
    await sendToAdmin("가".repeat(5000));
    const body = JSON.parse(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.text.length).toBe(4000);
  });
});

describe("telegramStatus", () => {
  it("미설정 → unconfigured (호출 없음)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { telegramStatus } = await loadWithEnv({
      TELEGRAM_BOT_TOKEN: undefined,
      TELEGRAM_CHAT_ID: undefined,
    });
    expect(await telegramStatus()).toBe("unconfigured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("getMe ok → ok", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    const { telegramStatus } = await loadWithEnv(ENV);
    expect(await telegramStatus()).toBe("ok");
  });

  it("토큰이 틀리면 error — 던지지 않는다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 401 }));
    const { telegramStatus } = await loadWithEnv(ENV);
    expect(await telegramStatus()).toBe("error");
  });
});
