import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { sessionToken } from "@/lib/adminAuth";

/**
 * 관리자 로그인 — 브루트포스 방어:
 * - IP당 10분 창에 10회 실패 제한 (서버리스 인스턴스별 메모리라 완전하진
 *   않지만 무차별 대입 비용을 크게 올림)
 * - 실패 시 400ms 지연 (온라인 대입 속도 제한)
 * - 해시 후 timingSafeEqual 비교 (타이밍 누출 방지, 길이 상이도 안전)
 * - 프로덕션에서 secure 쿠키
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 10;
const fails = new Map<string, { count: number; resetAt: number }>();

function ipOf(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  );
}

function tooMany(ip: string): boolean {
  const e = fails.get(ip);
  if (!e || Date.now() > e.resetAt) return false;
  return e.count >= MAX_FAILS;
}

function recordFail(ip: string) {
  const now = Date.now();
  const e = fails.get(ip);
  if (!e || now > e.resetAt) fails.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else e.count++;
  // 메모리 누수 방지 — 만료 엔트리 정리
  if (fails.size > 1000) {
    for (const [k, v] of fails) if (now > v.resetAt) fails.delete(k);
  }
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  const ip = ipOf(req);

  if (tooMany(ip)) {
    return NextResponse.json(
      { error: "시도가 너무 많습니다. 10분 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    password?: string;
  } | null;
  const password = body?.password;

  if (!expected || typeof password !== "string" || !safeEqual(password, expected)) {
    recordFail(ip);
    await sleep(400);
    return NextResponse.json(
      { error: "비밀번호가 올바르지 않습니다." },
      { status: 401 }
    );
  }

  fails.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_session", sessionToken()!, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8시간
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_session", "", { path: "/", maxAge: 0 });
  return res;
}
