import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { sendSms } from "@/lib/sms";
import { formatYmdKo } from "@/lib/wedding";

/**
 * 합석 가능 문의 SMS — 해당 주문의 참여자(연락처 보유)에게
 * "다른 하객 팀과 같은 자리에서 함께 받아도 괜찮은지" 확인 문자 발송.
 * 확인되면 관리자가 /api/admin/merge 로 병합.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json(
      { error: "Supabase service role key 가 설정되지 않았습니다." },
      { status: 503 }
    );

  const { id } = await params;

  const { data: delivery, error: dErr } = await supabaseAdmin
    .from("deliveries")
    .select("id, date, time_slot, status")
    .eq("id", id)
    .single();
  if (dErr || !delivery)
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });

  const { data: parts } = await supabaseAdmin
    .from("participants")
    .select("name, phone")
    .eq("delivery_id", id)
    .not("phone", "is", null);

  const targets = (parts ?? []) as { name: string; phone: string }[];
  if (targets.length === 0)
    return NextResponse.json({ error: "연락처가 있는 참여자가 없습니다." }, { status: 400 });

  const results = await Promise.all(
    targets.map((p) =>
      sendSms(
        p.phone,
        `[청첩장 배달] ${p.name}님, 신청하신 ${formatYmdKo(delivery.date)} ${delivery.time_slot} 배달을 같은 날 다른 하객 팀과 한 자리에서 함께 받아도 괜찮으실까요? 괜찮으시면 이 문자에 "좋아요"로 회신 부탁드려요 :)`
      ).then((r) => ({ name: p.name, ...r }))
    )
  );

  const sent = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.some((r) => r.skipped);
  return NextResponse.json({ count: targets.length, sent, skipped });
}
