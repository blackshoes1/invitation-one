import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { sendSms, isSmsConfigured } from "@/lib/sms";
import { formatYmdKo } from "@/lib/wedding";
import { siteOrigin } from "@/lib/siteUrl";
import { resolveParticipantByToken, rotateManageToken, manageUrl } from "@/lib/manageToken";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";

/**
 * 주문 대표의 일정 변경 요청 — 관리 토큰으로 본인 확인 (P0-2).
 * - 혼자인 주문: 즉시 변경 (result: 'solo')
 * - 여러 명인 주문: 대표만 새 날짜로 이동, 함께 받던 분들에게 SMS 로 이동 동의 요청
 *   (result: 'proposed', 각자 관리 링크에서 수락/사양)
 *
 * ※ propose_reschedule 는 service_role 로만 실행 → 연락처가 클라이언트로 노출되지 않고,
 *   SMS 발송을 반드시 서버가 함께 처리하도록 강제.
 * ※ 동의 요청 SMS 의 관리 링크는 수신자별로 토큰을 회전 발급 — SMS 가 실제로
 *   나갈 때(SOLAPI 설정)만 회전해, 미설정 환경에서 기존 링크가 죽는 일을 막는다.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    date?: string;
    time?: string;
    location?: string;
  };

  if (!body.token || !body.date || !body.time) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!isAdminConfigured || !supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role key 가 설정되지 않았습니다." },
      { status: 503 }
    );
  }
  if (!(await rateLimitAllow(`manage:${clientIp(req)}`, 120, 600)))
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });

  const pid = await resolveParticipantByToken(body.token);
  if (!pid) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  const { data, error } = await supabaseAdmin.rpc("propose_reschedule", {
    p_participant: pid,
    p_date: body.date,
    p_time: body.time,
    p_location: body.location ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    result: string;
    moved_count: number;
    new_delivery: string | null;
  } | null;
  const result = row?.result ?? "not_found";

  // solo / not_owner / range / taken / not_found — SMS 없음
  if (result !== "proposed" || !row?.new_delivery) {
    return NextResponse.json({ result, moved_count: 0, sms: null });
  }

  // 동의 대기 인원(연락처 보유)에게 이동 동의 요청 SMS
  const { data: parts } = await supabaseAdmin
    .from("participants")
    .select("id, name, phone")
    .eq("pending_delivery_id", row.new_delivery)
    .not("phone", "is", null);

  const targets = (parts ?? []) as { id: string; name: string; phone: string }[];
  if (!isSmsConfigured) {
    return NextResponse.json({
      result,
      moved_count: row.moved_count,
      sms: { count: targets.length, sent: 0, skipped: true },
    });
  }

  const origin = siteOrigin(req); // Host 헤더 조작 방지 — env 고정 URL 우선
  const results = await Promise.all(
    targets.map(async (p) => {
      const tok = await rotateManageToken(p.id);
      if (!tok) return { ok: false, skipped: false };
      const link = manageUrl(origin, tok);
      const text = `[청첩장 배달] ${p.name}님, 함께 받기로 한 일정이 ${formatYmdKo(
        body.date as string
      )} ${body.time}(으)로 변경 제안되었어요. 함께 이동할지 아래에서 확인해주세요 🛵 ${link}`;
      return sendSms(p.phone, text);
    })
  );

  return NextResponse.json({
    result,
    moved_count: row.moved_count,
    sms: {
      count: targets.length,
      sent: results.filter((r) => r.ok && !r.skipped).length,
      skipped: results.some((r) => r.skipped),
    },
  });
}
