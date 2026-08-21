import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  checkAdmin,
  createAdminSession,
  revokeAdminSession,
} from "@/lib/adminAuth";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import { isAdminConfigured } from "@/lib/supabaseAdmin";

/**
 * 관리자 로그인 — 브루트포스 방어 (P1-2):
 * - DB 기반 rate limit(rl_hit): IP당 10분 창 10회 시도 + 전체 10분 100회
 *   (서버리스 인스턴스와 무관하게 유지, DB 장애 시 fail-closed)
 * - 실패 시 400ms 지연 (온라인 대입 속도 제한)
 * - 해시 후 timingSafeEqual 비교 (타이밍 누출 방지, 길이 상이도 안전)
 * - 성공 시 무작위 세션 토큰 발급 → httpOnly·SameSite=Lax·(prod) Secure 쿠키, 8시간
 */
const PER_IP = { limit: 10, windowSec: 600 };
const GLOBAL = { limit: 100, windowSec: 600 };

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !isAdminConfigured)
    return NextResponse.json({ error: "서버 설정이 필요합니다." }, { status: 503 });

  const ip = clientIp(req);
  const [okIp, okGlobal] = await Promise.all([
    rateLimitAllow(`admin-login:${ip}`, PER_IP.limit, PER_IP.windowSec),
    rateLimitAllow("admin-login:global", GLOBAL.limit, GLOBAL.windowSec),
  ]);
  if (!okIp || !okGlobal) {
    return NextResponse.json(
      { error: "시도가 너무 많습니다. 10분 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    password?: string;
  } | null;
  const password = body?.password;

  if (typeof password !== "string" || !safeEqual(password, expected)) {
    await sleep(400);
    return NextResponse.json(
      { error: "비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  const token = await createAdminSession(req);
  if (!token)
    return NextResponse.json({ error: "세션을 만들지 못했습니다." }, { status: 503 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, adminCookieOptions());
  return res;
}

/** 로그아웃 — 서버 세션 철회 + 쿠키 삭제 */
export async function DELETE(req: Request) {
  await revokeAdminSession(req);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { ...adminCookieOptions(), maxAge: 0 });
  return res;
}

/** 세션 확인 — 쿠키가 유효하면 200. 새로고침 시 재로그인 생략용 (비밀번호 불필요) */
export async function GET(req: Request) {
  if (!(await checkAdmin(req)))
    return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true });
}
