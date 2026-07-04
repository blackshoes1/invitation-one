import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { sendSms } from "@/lib/sms";
import { formatYmdKo } from "@/lib/wedding";

/**
 * 주문 대표의 일정 변경 요청 (참여자 본인 링크 = participantId 가 인증 토큰 역할).
 * - 혼자인 주문: 즉시 변경 (result: 'solo')
 * - 여러 명인 주문: 대표만 새 날짜로 이동, 함께 받던 분들에게 SMS 로 이동 동의 요청
 *   (result: 'proposed', 각자 /delivery/manage/{id} 에서 수락/사양)
 *
 * ※ propose_reschedule 는 service_role 로만 실행 → 연락처가 클라이언트로 노출되지 않고,
 *   SMS 발송을 반드시 서버가 함께 처리하도록 강제.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    participantId?: string;
    date?: string;
    time?: string;
    location?: string;
  };

  if (!body.participantId || !body.date || !body.time) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!isAdminConfigured || !supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role key 가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const { data, error } = await supabaseAdmin.rpc("propose_reschedule", {
    p_participant: body.participantId,
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

  const origin = new URL(req.url).origin;
  const targets = (parts ?? []) as { id: string; name: string; phone: string }[];
  const results = await Promise.all(
    targets.map((p) => {
      const link = `${origin}/delivery/manage/${p.id}`;
      const text = `[청첩장 배달] ${p.name}님, 함께 받기로 한 일정이 ${formatYmdKo(
        body.date as string
      )} ${body.time}(으)로 변경 제안되었어요. 함께 이동할지 아래에서 확인해주세요 🛵 ${link}`;
      return sendSms(p.phone, text).then((r) => ({ id: p.id, name: p.name, ...r }));
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
