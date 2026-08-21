import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * DB 기반 rate limit (서버 전용). 서버리스 다중 인스턴스에서도 일관되게 동작.
 * rl_hit(key, limit, window) 는 원자적 upsert 로 카운트하고 허용 여부를 반환.
 *
 * 실패 정책: DB 오류 시 fail-closed(false) — 인증/업로드 보호 용도라 차단이 안전.
 */
export async function rateLimitAllow(
  key: string,
  limit: number,
  windowSec: number
): Promise<boolean> {
  if (!supabaseAdmin) return false;
  try {
    const { data, error } = await supabaseAdmin.rpc("rl_hit", {
      p_key: key,
      p_limit: limit,
      p_window_sec: windowSec,
    });
    if (error) {
      console.warn("[rate-limit] rl_hit 실패 — fail-closed:", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.warn("[rate-limit] 예외 — fail-closed:", String(e));
    return false;
  }
}

/** 클라이언트 IP (Vercel/프록시 환경) */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
