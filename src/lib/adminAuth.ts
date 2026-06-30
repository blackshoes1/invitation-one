import crypto from "node:crypto";

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
