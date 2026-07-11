import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { kakaoTokenStatus } from "@/lib/kakao";

/** 관리자 알림(카카오) 연결 상태 (AD-4) */
export async function GET(req: Request) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = await kakaoTokenStatus();
  return NextResponse.json({ status });
}
