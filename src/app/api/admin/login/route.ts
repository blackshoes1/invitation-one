import { NextResponse } from "next/server";
import { sessionToken } from "@/lib/adminAuth";

export async function POST(req: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  const { password } = (await req.json()) as { password?: string };

  if (!expected || password !== expected) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("admin_session", sessionToken()!, {
    httpOnly: true,
    sameSite: "lax",
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
