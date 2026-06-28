import crypto from "node:crypto";

/**
 * 솔라피(Solapi) SMS 발송 — 서버 전용 스캐폴드.
 * .env.local 에 키가 없으면 실제 발송을 건너뛰고 { skipped: true } 를 반환합니다.
 *
 *   SOLAPI_API_KEY=...
 *   SOLAPI_API_SECRET=...
 *   SOLAPI_SENDER=01000000000   (솔라피에 사전 등록된 발신번호)
 */
const API_KEY = process.env.SOLAPI_API_KEY;
const API_SECRET = process.env.SOLAPI_API_SECRET;
const SENDER = process.env.SOLAPI_SENDER;

export const isSmsConfigured = Boolean(API_KEY && API_SECRET && SENDER);

interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export async function sendSms(to: string, text: string): Promise<SendResult> {
  if (!isSmsConfigured) {
    console.info("[sms skipped — 키 미설정]", { to, text });
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
