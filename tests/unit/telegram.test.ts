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

/**
 * telegramStatus 는 **"거절당했다"와 "닿지 못했다"를 구분해야 한다.**
 *
 * 예전에는 timeout·네트워크 한 번에도 "error" 를 돌려줬고, 어드민 배너가 그걸 받아
 * "알림 연결이 끊겼어요 — 봇 토큰을 확인해주세요" 를 띄웠다. 토큰은 멀쩡한데
 * 진단이 틀린 안내였고, 배너는 로그인 시 한 번만 확인하므로 새로고침 전까지
 * 빨간 채로 박혀 있었다 (2026-09-09 오탐).
 */
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

  it("getMe ok → ok (한 번만 부른다)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { telegramStatus } = await loadWithEnv(ENV);
    expect(await telegramStatus()).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("텔레그램이 자격 증명을 거절하면 error — 재시도하지 않는다", async () => {
    // 401/403/404 는 사람이 토큰을 고쳐야 하는 상태다. 다시 물어도 답은 같다.
    for (const status of [401, 403, 404]) {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("nope", { status }));
      const { telegramStatus } = await loadWithEnv(ENV);
      expect(await telegramStatus()).toBe("error");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      vi.restoreAllMocks();
    }
  });

  it("200 + ok:false 도 error — 재시도하지 않는다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), { status: 200 })
    );
    const { telegramStatus } = await loadWithEnv(ENV);
    expect(await telegramStatus()).toBe("error");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("네트워크가 한 번 튀어도 재시도해서 살린다", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("ETIMEDOUT"))
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const { telegramStatus } = await loadWithEnv(ENV);
    expect(await telegramStatus()).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("재시도해도 못 닿으면 null — **error 로 단정하지 않는다**", async () => {
    // null 이면 어드민 배너가 안 뜨고 안전망도 실패로 보지 않는다.
    // 진짜 발송이 깨졌다면 보낼 게 생겼을 때 "클레임 n건 중 발송 0건"으로 잡힌다.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    const { telegramStatus } = await loadWithEnv(ENV);
    expect(await telegramStatus()).toBeNull();
  });

  it("5xx 는 텔레그램 쪽 사정 — 토큰 문제로 보지 않는다", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("bad gateway", { status: 502 }));
    const { telegramStatus } = await loadWithEnv(ENV);
    expect(await telegramStatus()).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2); // 재시도했다
  });
});
