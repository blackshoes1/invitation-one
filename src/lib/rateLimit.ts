/**
 * Upstash Redis REST 기반 rate limit (서버 전용).
 * 서버리스 인스턴스 간 공유되는 고정 윈도우 카운터 — INCR + EXPIRE.
 *
 * 정책 (docs/CHECKIN_SEATING_SPEC.md §11):
 * - 인메모리 방식은 서버리스에서 무의미하므로 사용하지 않는다.
 * - 운영 환경에서 Upstash 미설정 시 공개 "쓰기" API 는 fail-closed.
 *   (개발 환경 NODE_ENV!=='production' 에서는 통과시켜 로컬 작업을 막지 않는다)
 *
 * .env.local:
 *   UPSTASH_REDIS_REST_URL=...
 *   UPSTASH_REDIS_REST_TOKEN=...
 */

const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const isRateLimitConfigured = Boolean(URL_ && TOKEN);

export interface RateLimitResult {
  ok: boolean;
  /** limiter 미설정으로 차단된 경우 true (503 응답용) */
  unavailable?: boolean;
}

/** 요청 IP 추출 (Vercel: x-forwarded-for 첫 항목) */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * 고정 윈도우 카운터. key 는 용도별 접두사(예: "rsvp", "pass-get") + IP.
 * @param limit   윈도우당 허용 횟수
 * @param windowSec 윈도우 길이(초)
 * @param failClosed 미설정 시 차단 여부 — 공개 쓰기 API 는 true
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  failClosed: boolean
): Promise<RateLimitResult> {
  if (!isRateLimitConfigured) {
    if (process.env.NODE_ENV !== "production") return { ok: true };
    return failClosed ? { ok: false, unavailable: true } : { ok: true };
  }

  try {
    // 고정 윈도우: 윈도우 번호를 키에 포함 → INCR, 첫 증가 시 EXPIRE
    const windowNo = Math.floor(Date.now() / 1000 / windowSec);
    const redisKey = `rl:${key}:${windowNo}`;
    const res = await fetch(`${URL_}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, String(windowSec + 5), "NX"],
      ]),
      // rate limit 조회가 요청 전체를 오래 붙잡지 않도록
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const j = (await res.json()) as Array<{ result?: number }>;
    const count = Number(j?.[0]?.result ?? 0);
    return { ok: count <= limit };
  } catch (e) {
    console.error("[rateLimit] upstash 오류:", e);
    // 설정은 됐지만 일시 장애 — 쓰기 API 는 막고, 조회는 통과
    return failClosed ? { ok: false, unavailable: true } : { ok: true };
  }
}

/** 표준 응답 헬퍼 — 429 또는 503(fail-closed 미설정) */
export function rateLimitResponse(r: RateLimitResult): Response {
  if (r.unavailable) {
    return Response.json(
      { error: "요청 처리 준비가 되지 않았습니다. 잠시 후 다시 시도해주세요." },
      { status: 503 }
    );
  }
  return Response.json(
    { error: "요청이 너무 많아요. 잠시 후 다시 시도해주세요." },
    { status: 429 }
  );
}
