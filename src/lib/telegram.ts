/**
 * 텔레그램 봇 알림 — 관리자(신랑신부) 주문 알림용. 서버 전용.
 *
 * 카카오 "나에게 보내기"를 대체한다. 카카오는 refresh token 이 약 2개월마다
 * 만료돼 그때마다 재발급해야 했고, 만료를 막으려 유휴 상태에서도 주기적으로
 * 토큰을 갱신하는 로직까지 필요했다. 텔레그램 봇 토큰은 **만료되지 않는다** —
 * "토큰이 만료돼 알림이 멈춘다"는 실패 유형 자체가 사라진다.
 *
 * .env.local 설정 (없으면 자동 skip):
 *   TELEGRAM_BOT_TOKEN=...   BotFather 로 만든 봇의 토큰
 *   TELEGRAM_CHAT_ID=...     알림을 받을 채팅 id
 *
 * 발급 절차 (.env.local.example 에도 요약 있음):
 *   1) 텔레그램에서 @BotFather → /newbot → 봇 토큰 발급
 *   2) 만든 봇과 1:1 대화방을 열고 아무 메시지나 전송 (봇은 먼저 말을 걸 수 없다)
 *   3) https://api.telegram.org/bot<토큰>/getUpdates 를 열어
 *      result[0].message.chat.id 를 확인 → TELEGRAM_CHAT_ID
 */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export const isTelegramConfigured = Boolean(BOT_TOKEN && CHAT_ID);

const api = (method: string) =>
  `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

/**
 * 발송 timeout. 클레임 lease(3분)보다 충분히 짧아야 한다 — 안 그러면 느린 발송
 * 하나가 lease 를 넘겨 다른 worker 에게 회수되고 같은 알림이 두 번 간다.
 */
const SEND_TIMEOUT_MS = 15_000;

interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * 관리자에게 메시지 전송.
 *
 * ※ 전체를 try/catch 로 감싼다 — 여기서 예외가 새어 나가면 아웃박스 행이
 *   'sending' 상태로 갇힌다 (2026-09-06 에 실제로 겪은 사고).
 *   실패는 던지지 말고 반드시 `{ ok: false, error }` 로 돌려줄 것.
 */
export async function sendToAdmin(text: string): Promise<SendResult> {
  if (!isTelegramConfigured) {
    console.info("[telegram skipped — 키 미설정]", text);
    return { ok: true, skipped: true };
  }
  try {
    const res = await fetch(api("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // timeout 이 없으면 이 fetch 가 클레임 lease(3분)보다 오래 매달릴 수 있고,
      // 그 사이 다른 worker 가 같은 행을 회수해 **중복 발송**이 된다.
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      body: JSON.stringify({
        chat_id: CHAT_ID,
        // parse_mode 를 쓰지 않는다 — 하객 이름·배송지가 그대로 들어가므로
        // 이스케이프를 한 군데라도 빠뜨리면 발송이 통째로 실패한다. 평문이 안전하다.
        text: text.slice(0, 4000), // 텔레그램 한도 4096자, 여유를 둔다
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok)
      return { ok: false, error: `telegram ${res.status}: ${await res.text()}` };
    // 텔레그램은 HTTP 200 에 { ok: false, description } 을 담아 실패를 알리기도 한다
    const j = (await res.json().catch(() => null)) as
      | { ok?: boolean; description?: string }
      | null;
    if (j && j.ok === false)
      return { ok: false, error: `telegram: ${j.description ?? "unknown"}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export type TelegramStatus = "ok" | "error" | "unconfigured";

/**
 * 연결 점검 (getMe) — 메시지 발송 없음.
 *
 * 카카오와 달리 **토큰을 살려두려는 목적이 아니다**(만료가 없다). 봇 토큰이
 * 잘못됐거나 봇이 삭제·차단된 경우를 미리 잡기 위한 것뿐이라, 자주 부를 이유가 없다.
 */
export async function telegramStatus(): Promise<TelegramStatus> {
  if (!isTelegramConfigured) return "unconfigured";
  try {
    const res = await fetch(api("getMe"), {
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) return "error";
    const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
    return j?.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}
