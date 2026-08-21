import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { clientIp } from "@/lib/rateLimit";

/**
 * 관리자 인증 (서버 전용, P1-1).
 * - 로그인 성공 시 무작위 세션 토큰(randomBytes 32)을 발급해 httpOnly 쿠키로 내려주고
 *   DB(admin_sessions)에는 sha256 해시만 저장한다. ADMIN_PASSWORD 에서 파생되는 값은
 *   어디에도 없으므로 비밀번호가 바뀌지 않아도 세션을 개별 만료/철회할 수 있다.
 * - 세션 만료 8시간(절대). 로그아웃 시 revoked_at 기록 + 쿠키 삭제.
 * - x-admin-password 헤더 폴백은 제거 — 클라이언트/스크립트 어디서도 쓰지 않았고,
 *   매 요청마다 비밀번호를 실어 보내는 경로를 남길 이유가 없다.
 *   .env.local: ADMIN_PASSWORD=원하는비밀번호
 */
export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_TTL_SEC = 60 * 60 * 8;

const TOKEN_RE = /^[0-9a-f]{64}$/;
const hashToken = (raw: string) =>
  crypto.createHash("sha256").update(raw).digest("hex");

export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SEC,
  };
}

function cookieToken(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));
  const raw = m?.[1] ?? "";
  return TOKEN_RE.test(raw) ? raw : null;
}

/** 세션 발급 — 성공 시 raw 토큰(쿠키 값) 반환, 실패 시 null */
export async function createAdminSession(req: Request): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const raw = crypto.randomBytes(32).toString("hex");
  const { error } = await supabaseAdmin.from("admin_sessions").insert({
    token_hash: hashToken(raw),
    expires_at: new Date(Date.now() + ADMIN_SESSION_TTL_SEC * 1000).toISOString(),
    ip: clientIp(req),
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 200),
  });
  if (error) {
    console.error("[adminAuth] session insert failed:", error.message);
    return null;
  }
  return raw;
}

/** 현재 요청의 세션 철회 (로그아웃) */
export async function revokeAdminSession(req: Request): Promise<void> {
  const raw = cookieToken(req);
  if (!raw || !supabaseAdmin) return;
  await supabaseAdmin
    .from("admin_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", hashToken(raw))
    .is("revoked_at", null);
}

export async function checkAdmin(req: Request): Promise<boolean> {
  if (!process.env.ADMIN_PASSWORD || !supabaseAdmin) return false;
  const raw = cookieToken(req);
  if (!raw) return false;
  const { data, error } = await supabaseAdmin
    .from("admin_sessions")
    .select("expires_at, revoked_at")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  if (error || !data || data.revoked_at) return false;
  return new Date(data.expires_at).getTime() > Date.now();
}

/**
 * 관리자 API 라우트 공용 가드 — 인증(401)·Supabase 설정(503) 검사.
 * 통과하면 null, 실패하면 에러 응답을 반환합니다.
 *
 *   const bad = await adminGuard(req);
 *   if (bad) return bad;
 *   // 이후 supabaseAdmin! 사용 가능 (503 가드 통과 = non-null 보장)
 */
export async function adminGuard(req: Request): Promise<NextResponse | null> {
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json(
      { error: "Supabase service role key 가 설정되지 않았습니다." },
      { status: 503 }
    );
  if (!(await checkAdmin(req)))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
