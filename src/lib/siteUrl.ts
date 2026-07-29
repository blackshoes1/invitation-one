/**
 * 발신 링크(SMS·카톡)용 사이트 절대 URL. 서버 전용.
 *
 * 요청 Host 헤더는 클라이언트가 조작할 수 있으므로(특히 공개 reschedule
 * 엔드포인트 — 조작 시 피해자 폰으로 공격자 도메인 링크가 담긴 문자가 감),
 * env 고정값(NEXT_PUBLIC_SITE_URL)을 우선 사용하고,
 * 개발 환경에서만 요청 origin(localhost)으로 폴백한다.
 */
const FALLBACK = "https://invitation-one-three.vercel.app";

export function siteOrigin(req?: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/+$/, "");
  if (process.env.NODE_ENV !== "production" && req)
    return new URL(req.url).origin;
  return FALLBACK;
}
