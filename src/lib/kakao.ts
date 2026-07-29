/**
 * 카카오톡 "나에게 보내기" — 관리자(신랑신부) 알림용. 서버 전용.
 *
 * 새 주문/합석/마음배송이 들어오면 신랑 카카오톡으로 메시지를 보냅니다.
 * 웹 푸시 대신 채택: 권한/설치 없이 항상 보는 카톡으로 도달.
 *
 * .env.local 설정 (없으면 자동 skip):
 *   KAKAO_REST_API_KEY=...      (developers.kakao.com 앱의 REST API 키)
 *   KAKAO_REFRESH_TOKEN=...     (talk_message 동의로 발급받은 refresh token)
 *
 * ※ refresh token 은 약 2개월 유효 — 만료 전 재발급 필요.
 *   재발급 절차 (.env.local.example 에도 요약 있음):
 *   1) https://kauth.kakao.com/oauth/authorize?client_id={REST_KEY}
 *        &redirect_uri={등록한 URI}&response_type=code&scope=talk_message
 *   2) 받은 code 로 https://kauth.kakao.com/oauth/token 호출 → refresh_token
 */
import { siteOrigin } from "@/lib/siteUrl";

const REST_KEY = process.env.KAKAO_REST_API_KEY;
const REFRESH_TOKEN = process.env.KAKAO_REFRESH_TOKEN;

export const isKakaoConfigured = Boolean(REST_KEY && REFRESH_TOKEN);

interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/** refresh token → access token (매 발송 시 갱신, 저빈도라 충분) */
async function getAccessToken(): Promise<string | null> {
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: REST_KEY as string,
      refresh_token: REFRESH_TOKEN as string,
    }),
  });
  if (!res.ok) {
    console.error("[kakao] token refresh 실패:", res.status, await res.text());
    return null;
  }
  const j = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (j.refresh_token) {
    // 카카오가 새 refresh token 을 내려줌 = 기존 토큰 만료 임박.
    // 시크릿이므로 값 자체는 로그에 남기지 않는다 (Vercel 로그 잔존 방지).
    // 재발급 절차는 파일 상단 주석 참고 — 만료 여부는 admin 패널(AD-4)에서 감지됨.
    console.warn(
      "[kakao] 새 refresh token 이 발급되었습니다 — 만료 임박. KAKAO_REFRESH_TOKEN 재발급 필요."
    );
  }
  return j.access_token ?? null;
}

export type KakaoTokenStatus = "ok" | "expired" | "unconfigured";

/** 관리자 알림 연결 상태 — 만료(재발급 필요) 사전 감지용 (AD-4). 메시지 발송 없음. */
export async function kakaoTokenStatus(): Promise<KakaoTokenStatus> {
  if (!isKakaoConfigured) return "unconfigured";
  try {
    const token = await getAccessToken();
    return token ? "ok" : "expired";
  } catch {
    return "expired";
  }
}

/** 나에게 보내기 (텍스트 + 링크 버튼) */
export async function sendToMe(text: string, linkUrl?: string): Promise<SendResult> {
  if (!isKakaoConfigured) {
    console.info("[kakao skipped — 키 미설정]", text);
    return { ok: true, skipped: true };
  }
  try {
    const token = await getAccessToken();
    if (!token) return { ok: false, error: "token" };

    const template = {
      object_type: "text",
      text: text.slice(0, 190), // 텍스트 템플릿 200자 제한
      link: linkUrl
        ? { web_url: linkUrl, mobile_web_url: linkUrl }
        : { web_url: `${siteOrigin()}/admin` },
      button_title: "관리자 열기",
    };

    const res = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${token}`,
      },
      body: new URLSearchParams({ template_object: JSON.stringify(template) }),
    });
    if (!res.ok) return { ok: false, error: `kakao ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
