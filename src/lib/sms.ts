import crypto from "node:crypto";

/**
 * 솔라피(Solapi) SMS 발송 — 서버 전용 스캐폴드.
 * .env.local 에 키가 없으면 실제 발송을 건너뛰고 { skipped: true } 를 반환합니다.
 *
 *   SOLAPI_API_KEY=...
 *   SOLAPI_API_SECRET=...
 *   SOLAPI_SENDER=01000000000   (솔라피에 사전 등록된 발신번호)
 */
/**
 * ⚠️ `.trim()` 이 핵심이다. 대시보드에서 값을 붙여넣을 때 줄바꿈·공백이 함께
 * 들어가는 일이 잦은데, 그러면 솔라피가 통째로 거절한다. 2026-09-09 에 실제로
 * 겪었다 — 확정 문자 4건이 전부 `"apiKey" length must be 16` 으로 실패했다.
 * 눈으로는 키가 멀쩡해 보여서 원인을 찾는 데 한참 걸렸다.
 */
const API_KEY = process.env.SOLAPI_API_KEY?.trim();
const API_SECRET = process.env.SOLAPI_API_SECRET?.trim();
const SENDER = process.env.SOLAPI_SENDER?.trim();

/** 솔라피 API 키는 정확히 16자다 (예: NCS…). */
const API_KEY_LEN = 16;

/**
 * 키 상태 — "없음"과 "잘못됨"을 구분한다.
 *
 * 없으면 발송을 건너뛰는 게 맞다(로컬·미설정 배포). 하지만 **형식이 잘못된 키로
 * 발송을 시도하는 것은 그냥 실패다.** 예전에는 둘을 구분하지 않아, 잘못된 키로
 * 하객 수만큼 400 을 맞고 그걸 각각 "발송 실패"로만 셌다. 서버에 왜 실패했는지도
 * 남지 않았다.
 */
export type SmsConfigProblem = { code: "missing" } | { code: "bad_key"; length: number };

export function smsConfigProblem(): SmsConfigProblem | null {
  if (!API_KEY || !API_SECRET || !SENDER) return { code: "missing" };
  // 키 값 자체는 절대 남기지 않는다 — 길이만으로 진단에 충분하다.
  if (API_KEY.length !== API_KEY_LEN) return { code: "bad_key", length: API_KEY.length };
  return null;
}

export const isSmsConfigured = Boolean(API_KEY && API_SECRET && SENDER);

interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export async function sendSms(to: string, text: string): Promise<SendResult> {
  const problem = smsConfigProblem();
  if (problem?.code === "bad_key") {
    // 사람이 고쳐야 하는 설정 오류다. 하객 수만큼 솔라피를 두드려 봐야
    // 똑같이 거절당하므로 시도하지 않고, 무엇이 틀렸는지 그대로 말한다.
    console.error("[sms] SOLAPI_API_KEY 길이 오류", {
      expected: API_KEY_LEN,
      actual: problem.length,
    });
    return {
      ok: false,
      error: `SOLAPI_API_KEY 형식 오류 — ${API_KEY_LEN}자여야 하는데 ${problem.length}자입니다. Vercel 환경변수에 공백·줄바꿈이 섞이지 않았는지 확인해주세요.`,
    };
  }
  if (!isSmsConfigured) {
    // ⚠️ to(전화번호)와 text(관리·복구 링크가 들어 있다)를 절대 찍지 않는다.
    //    개발 편의로 찍던 것인데, 키가 빠진 배포에서 그대로 돌면 서버 로그에
    //    번호와 링크가 평문으로 쌓인다.
    console.info("[sms skipped — 키 미설정]", { chars: text.length });
    return { ok: true, skipped: true };
  }

  const date = new Date().toISOString();
  const salt = crypto.randomBytes(32).toString("hex");
  const signature = crypto
    .createHmac("sha256", API_SECRET as string)
    .update(date + salt)
    .digest("hex");

  try {
    const res = await fetch("https://api.solapi.com/messages/v4/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
      },
      body: JSON.stringify({
        message: { to: to.replace(/-/g, ""), from: SENDER, text },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Solapi ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
