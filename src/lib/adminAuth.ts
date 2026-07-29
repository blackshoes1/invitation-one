import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

/**
 * 관리자 인증 (서버 전용).
 * - 로그인 시 비밀번호를 확인하고 httpOnly 쿠키(admin_session) 세션을 발급합니다.
 * - 이후 요청은 쿠키 세션으로 인증되어 비밀번호를 매번 전송하지 않습니다.
 *   .env.local: ADMIN_PASSWORD=원하는비밀번호
 */
export function sessionToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return crypto.createHash("sha256").update(`admin:${pw}`).digest("hex");
}

export function checkAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;

  // 1) 쿠키 세션
  const token = sessionToken();
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/);
  if (token && m && m[1] === token) return true;

  // 2) (호환) 헤더 비밀번호
  return req.headers.get("x-admin-password") === expected;
}

/**
 * 관리자 API 라우트 공용 가드 — 인증(401)·Supabase 설정(503) 검사.
 * 통과하면 null, 실패하면 에러 응답을 반환합니다.
 * (기존에 라우트마다 복붙되던 guard()/인라인 2중 체크의 단일화)
 *
 *   const bad = adminGuard(req);
 *   if (bad) return bad;
 *   // 이후 supabaseAdmin! 사용 가능 (503 가드 통과 = non-null 보장)
 */
export function adminGuard(req: Request): NextResponse | null {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json(
      { error: "Supabase service role key 가 설정되지 않았습니다." },
      { status: 503 }
    );
  return null;
}
