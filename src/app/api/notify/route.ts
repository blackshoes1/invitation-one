import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { sendToMe } from "@/lib/kakao";
import { formatYmdKo } from "@/lib/wedding";

/**
 * 새 신청 알림 → 신랑 카카오톡 "나에게 보내기".
 * 하객 브라우저가 신청 성공 직후 fire-and-forget 으로 호출.
 * 인증 없는 공개 엔드포인트이므로, participant 가 실제로 방금(10분 내)
 * 생성된 경우에만 발송해 오남용을 막는다.
 */
export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin) {
    return NextResponse.json({ skipped: true });
  }

  const { participant_id } = (await req.json().catch(() => ({}))) as {
    participant_id?: string;
  };
  if (!participant_id || !/^[0-9a-f-]{36}$/.test(participant_id))
    return NextResponse.json({ error: "bad request" }, { status: 400 });

  const { data: p } = await supabaseAdmin
    .from("participants")
    .select("id, type, name, region, message, is_owner, created_at, delivery_id")
    .eq("id", participant_id)
    .single();
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 방금 생성된 참여자만 (재호출/오남용 방지)
  const ageMs = Date.now() - new Date(p.created_at).getTime();
  if (ageMs > 10 * 60 * 1000)
    return NextResponse.json({ skipped: true });

  let text: string;
  if (p.type === "마음배송") {
    text = `💌 마음 배송 도착!\n${p.name} (${p.region ?? "지역 미상"})\n"${(p.message ?? "").slice(0, 60)}"`;
  } else {
    const { data: d } = await supabaseAdmin
      .from("deliveries")
      .select("date, time_slot, location")
      .eq("id", p.delivery_id)
      .single();
    const count = p.delivery_id
      ? (
          await supabaseAdmin
            .from("participants")
            .select("id", { count: "exact", head: true })
            .eq("delivery_id", p.delivery_id)
        ).count ?? 1
      : 1;
    text = p.is_owner
      ? `🛵 새 주문 접수!\n${p.name} · ${d ? formatYmdKo(d.date) : ""} ${d?.time_slot ?? ""}\n📍 ${d?.location ?? ""}`
      : `🤝 합석/합류!\n${p.name} → ${d ? formatYmdKo(d.date) : ""} ${d?.time_slot ?? ""} 주문 (현재 ${count}명)`;
  }

  const result = await sendToMe(text);
  return NextResponse.json(result);
}
