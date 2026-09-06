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
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const REST_KEY = process.env.KAKAO_REST_API_KEY;
const REFRESH_TOKEN = process.env.KAKAO_REFRESH_TOKEN;

export const isKakaoConfigured = Boolean(REST_KEY && REFRESH_TOKEN);

/**
 * refresh token 자동 회전 저장 (site_settings).
 * 카카오는 만료 임박(~1개월 전) 갱신 요청에 새 refresh token 을 내려주는데,
 * 이를 저장해 계속 사용하면 알림이 도는 한 토큰이 무한 연장된다
 * (env 재발급 불필요). 공개 RPC(get_site_settings)는 키 화이트리스트라
 * 이 키가 하객에게 노출되지 않는다.
 */
const TOKEN_KEY = "kakao_refresh_token";

async function currentRefreshToken(): Promise<string | null> {
  try {
    if (supabaseAdmin) {
      const { data } = await supabaseAdmin
        .from("site_settings")
        .select("value")
        .eq("key", TOKEN_KEY)
        .maybeSingle();
      if (typeof data?.value === "string" && data.value) return data.value;
    }
  } catch {
    /* 저장소 조회 실패 → env 폴백 */
  }
  return REFRESH_TOKEN ?? null;
}

async function saveRotatedToken(token: string): Promise<void> {
  try {
    if (!supabaseAdmin) throw new Error("no admin client");
    await supabaseAdmin.from("site_settings").upsert({
      key: TOKEN_KEY,
      value: token,
      updated_at: new Date().toISOString(),
    });
    console.warn("[kakao] 새 refresh token 발급 → site_settings 에 자동 저장됨 (재발급 불필요)");
  } catch {
    // 값은 보안상 로그에 남기지 않음 — 저장 실패 시 기존 토큰이 만료 전까지는 동작
    console.warn("[kakao] 회전 토큰 저장 실패 — 만료 전 KAKAO_REFRESH_TOKEN 수동 재발급 필요");
  }
}

interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/** refresh token → access token (매 발송 시 갱신, 저빈도라 충분) */
async function getAccessToken(): Promise<string | null> {
  const refresh = await currentRefreshToken(); // 회전 저장 토큰 우선, 없으면 env
  if (!refresh) return null;
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: REST_KEY as string,
      refresh_token: refresh,
    }),
  });
  if (!res.ok) {
    console.error("[kakao] token refresh 실패:", res.status, await res.text());
    return null;
  }
  const j = (await res.json()) as { access_token?: string; refresh_token?: string };
  if (j.refresh_token) {
    // 카카오가 새 refresh token 을 내려줌 = 기존 토큰 만료 임박 → 자동 회전 저장
    await saveRotatedToken(j.refresh_token);
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

const CHECKED_KEY = "kakao_token_checked_at";
/** 유휴 확인 간격 — 이보다 자주 부르면 건너뛴다 (토큰을 살려두기엔 충분한 간격) */
const IDLE_CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;

/**
 * 보낼 게 없을 때의 토큰 점검 — **간격 제한이 걸린** 버전.
 *
 * `kakaoTokenStatus()` 는 매번 카카오에 refresh 요청을 보낸다. 아웃박스 드레인이
 * 5분마다 돌게 되면서(pg_cron 안전망) 그대로 두면 하루 288번을 카카오에 치게 되고,
 * refresh token 회전까지 그만큼 자주 일어난다. 토큰을 살려두는 목적에는 몇 시간에
 * 한 번이면 충분하므로 마지막 확인 시각을 기록해 두고 건너뛴다.
 *
 * 확인을 건너뛰면 `null` 을 돌려준다 — 호출자는 "이번엔 모름"으로 다뤄야 하고,
 * 상태를 단정해선 안 된다.
 */
export async function kakaoTokenStatusThrottled(): Promise<KakaoTokenStatus | null> {
  if (!isKakaoConfigured) return "unconfigured";
  if (!supabaseAdmin) return kakaoTokenStatus();

  try {
    const { data } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", CHECKED_KEY)
      .maybeSingle();
    const last = typeof data?.value === "string" ? Date.parse(data.value) : NaN;
    if (Number.isFinite(last) && Date.now() - last < IDLE_CHECK_INTERVAL_MS) return null;
  } catch {
    /* 조회 실패 → 그냥 확인한다 (막는 쪽보다 확인하는 쪽이 안전) */
  }

  const status = await kakaoTokenStatus();
  // 확인 시각은 결과와 무관하게 남긴다 — 만료 상태에서 5분마다 재시도해도
  // 사람이 재발급하기 전엔 달라지지 않는다 (크론 워크플로가 따로 알린다)
  try {
    await supabaseAdmin.from("site_settings").upsert({
      key: CHECKED_KEY,
      value: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* 기록 실패해도 상태 자체는 유효하다 */
  }
  return status;
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
