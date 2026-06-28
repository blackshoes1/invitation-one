/**
 * 간단한 관리자 비밀번호 검증 (서버 전용).
 * 클라이언트가 'x-admin-password' 헤더로 보낸 값을 ADMIN_PASSWORD 와 비교합니다.
 *   .env.local: ADMIN_PASSWORD=원하는비밀번호
 */
export function checkAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const given = req.headers.get("x-admin-password");
  return given === expected;
}
