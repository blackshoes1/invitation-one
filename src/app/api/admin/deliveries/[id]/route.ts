import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { sendSms } from "@/lib/sms";
import { formatYmdKo } from "@/lib/wedding";
import type { DeliveryStatus } from "@/lib/supabase";

const VALID: DeliveryStatus[] = ["대기중", "확정", "완료"];

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
  const body = (await req.json()) as { status?: DeliveryStatus };
  const status = body.status;
  if (!status || !VALID.includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("deliveries")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 확정 시 신청자에게 SMS (솔라피 키 없으면 자동 skip)
  let sms: unknown = null;
  if (status === "확정" && data) {
    const text = `[청첩장 배달] ${data.name}님, 신청하신 ${formatYmdKo(
      data.date
    )} ${data.time_slot} ${data.location} 일정이 확정되었습니다. 곧 찾아뵙겠습니다 :)`;
    sms = await sendSms(data.phone, text);
  }

  return NextResponse.json({ delivery: data, sms });
}
