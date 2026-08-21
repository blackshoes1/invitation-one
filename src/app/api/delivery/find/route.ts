import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rotateManageToken } from "@/lib/manageToken";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";

/**
 * 내 신청 찾기 (P0-2) — 이름 + 연락처 뒷4자리 + 배송일로 본인 확인 후
 * 관리 링크를 **재발급**해 돌려준다 (토큰은 해시만 저장하므로 기존 raw 를
 * 되돌려줄 수 없음 → 회전. 가장 최근 발급 링크만 유효).
 * participant UUID 는 응답에 포함하지 않는다.
 */
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  if (!supabaseAdmin)
    return NextResponse.json({ error: "server_not_configured" }, { status: 503, headers: NO_STORE });

  // 본인확인 정보 대입 방지 — IP 당 10분 20회
  if (!(await rateLimitAllow(`find:${clientIp(req)}`, 20, 600)))
    return NextResponse.json({ error: "too_many_requests" }, { status: 429, headers: NO_STORE });

  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; last4?: unknown; date?: unknown }
    | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const last4 = typeof body?.last4 === "string" ? body.last4 : "";
  const date = typeof body?.date === "string" ? body.date : "";
  if (name.length < 2 || name.length > 30 || !/^\d{4}$/.test(last4) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });

  const { data, error } = await supabaseAdmin.rpc("find_participants", {
    p_name: name, p_last4: last4, p_date: date,
  });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });

  const rows = (Array.isArray(data) ? data : []) as {
    participant_id: string; type: string; name: string; date: string | null;
    time_slot: string | null; status: string | null; tracking_stage: string | null;
  }[];

  const results = [];
  for (const r of rows) {
    const tok = await rotateManageToken(r.participant_id);
    if (!tok) continue;
    results.push({
      type: r.type, name: r.name, date: r.date, time_slot: r.time_slot,
      status: r.status, tracking_stage: r.tracking_stage,
      manage_url: `/delivery/manage/${tok}`,
    });
  }
  return NextResponse.json({ results }, { headers: NO_STORE });
}
