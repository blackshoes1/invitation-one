import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { sendSms } from "@/lib/sms";
import { formatYmdKo } from "@/lib/wedding";
import type { DeliveryStatus, TrackingStage } from "@/lib/supabase";

const VALID: DeliveryStatus[] = ["대기중", "확정", "완료", "취소"];
const VALID_STAGE: TrackingStage[] = ["주문접수", "준비중", "배송출발", "배송완료"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdminConfigured || !supabaseAdmin) {
    return NextResponse.json(
      { error: "Supabase service role key 가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const { id } = await params;
  const body = (await req.json()) as {
    status?: DeliveryStatus;
    tracking_stage?: TrackingStage;
  };

  const patch: { status?: DeliveryStatus; tracking_stage?: TrackingStage } = {};

  if (body.status !== undefined) {
    if (!VALID.includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = body.status;
    // 상태를 완료로 넘기면 추적 단계도 배송완료로 맞춤 (미지정 시)
    if (body.status === "완료" && body.tracking_stage === undefined) {
      patch.tracking_stage = "배송완료";
    }
  }

  if (body.tracking_stage !== undefined) {
    if (!VALID_STAGE.includes(body.tracking_stage)) {
      return NextResponse.json({ error: "invalid stage" }, { status: 400 });
    }
    patch.tracking_stage = body.tracking_stage;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("deliveries")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 상태 변경 시 참여자 전원에게 SMS (참여 시스템 — 연락처 보유자 대상, 키 없으면 자동 skip)
  let sms: unknown = null;
  if (data && (patch.status === "확정" || patch.status === "취소")) {
    const { data: parts } = await supabaseAdmin
      .from("participants")
      .select("name, phone")
      .eq("delivery_id", id)
      .not("phone", "is", null);

    const targets = (parts ?? []) as { name: string; phone: string }[];
    const results = await Promise.all(
      targets.map((p) => {
        const text =
          patch.status === "확정"
            ? `[청첩장 배달] ${p.name}님, 신청하신 ${formatYmdKo(data.date)} ${data.time_slot} ${data.location} 일정이 확정되었습니다. 곧 찾아뵙겠습니다 :)`
            : `[청첩장 배달] ${p.name}님, 부득이하게 ${formatYmdKo(data.date)} ${data.time_slot} 일정이 취소되었습니다. 자세한 안내는 곧 연락드리겠습니다. 양해 부탁드립니다.`;
        return sendSms(p.phone, text).then((r) => ({ name: p.name, ...r }));
      })
    );
    sms = {
      count: targets.length,
      sent: results.filter((r) => r.ok && !r.skipped).length,
      skipped: results.some((r) => r.skipped),
      results,
    };
  }

  return NextResponse.json({ delivery: data, sms });
}
