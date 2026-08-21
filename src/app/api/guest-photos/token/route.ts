import { NextResponse } from "next/server";
import { issueUploadToken, UPLOAD_TOKEN_TTL_SEC } from "@/lib/signedToken";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import { isAdminConfigured } from "@/lib/supabaseAdmin";

const INVITATION_KEY = process.env.NEXT_PUBLIC_INVITATION_KEY ?? "";

/**
 * 업로드 토큰 재발급 — 청첩장을 오래 열어 두어 페이지 렌더 시 받은 토큰(2h)이
 * 만료됐을 때 클라이언트가 조용히 갱신하는 용도.
 * 게이트: 청첩장 접근 키(공개값이지만 무작위 스캐너 차단용 soft gate) + IP rate limit.
 * 실질 권한 제어는 업로드 API 의 토큰·rate limit 이 담당한다.
 */
export async function GET(req: Request) {
  if (!isAdminConfigured)
    return NextResponse.json({ error: "server_not_configured" }, { status: 503 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!INVITATION_KEY || key !== INVITATION_KEY)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await rateLimitAllow(`upload-token:${clientIp(req)}`, 30, 600)))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const token = issueUploadToken();
  if (!token)
    return NextResponse.json({ error: "server_not_configured" }, { status: 503 });
  return NextResponse.json(
    { token, ttl: UPLOAD_TOKEN_TTL_SEC },
    { headers: { "Cache-Control": "no-store" } }
  );
}
