import { NextResponse } from "next/server";
import { isAdminConfigured } from "@/lib/supabaseAdmin";
import { drainNotifications } from "@/lib/notifyOutbox";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";

/**
 * 새 신청 알림 드레인 (P1-3 아웃박스).
 * - 신청 내용은 DB 트리거가 notification_outbox 에 이미 적재돼 있다 → 이 라우트는
 *   participant_id 를 받지 않고(추측 UUID 로 조회·발송 유발 불가) 단지 "보낼 게 있으면
 *   보내라"는 신호다. 하객 브라우저가 신청 직후 fire-and-forget 으로 호출.
 * - 중복 발송 없음(원자 클레임), 실패는 outbox 에 남아 다음 호출/크론에서 재시도.
 * - GET: Vercel Cron(CRON_SECRET Bearer) 용 — 실패분 재시도 안전망.
 */
export async function POST(req: Request) {
  if (!isAdminConfigured) return NextResponse.json({ skipped: true });
  if (!(await rateLimitAllow(`notify:${clientIp(req)}`, 30, 600)))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const r = await drainNotifications(5);
  // 드레인 자체가 실패했으면(클레임 오류 등) 200 으로 돌려주지 않는다 — 예전에는
  // 조용히 "0건 정상"이라 알림이 통째로 멈춰도 안전망 크론이 초록이었다.
  return NextResponse.json(r, { status: r.error ? 500 : 200 });
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured) return NextResponse.json({ skipped: true });
  const r = await drainNotifications(20);
  return NextResponse.json(r, { status: r.error ? 500 : 200 });
}
