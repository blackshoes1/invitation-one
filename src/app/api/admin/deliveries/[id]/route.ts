import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { sendSms } from "@/lib/sms";
import {
  formatYmdKo,
  slotsForDate,
  DELIVERY_START,
  DELIVERY_END,
} from "@/lib/wedding";
import type { TimeSlot } from "@/lib/wedding";
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
    // 일정 수정 (그룹 담당자가 신청한 일자·시간·장소를 관리자가 조정)
    date?: string;
    time_slot?: string;
    location?: string;
    notify?: boolean; // 일정 변경 시 참여자 SMS 안내 여부 (기본 true)
  };

  const patch: {
    status?: DeliveryStatus;
    tracking_stage?: TrackingStage;
    date?: string;
    time_slot?: string;
    location?: string;
    updated_at?: string;
  } = {};

  // ----- 일정 수정 검증 (participant 쪽 reschedule_delivery_v2 와 같은 규칙) -----
  const scheduleChange =
    body.date !== undefined ||
    body.time_slot !== undefined ||
    body.location !== undefined;
  if (scheduleChange) {
    if (body.date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date))
        return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
      if (body.date < DELIVERY_START || body.date > DELIVERY_END)
        return NextResponse.json(
          { error: `배달 가능 기간(${DELIVERY_START}~${DELIVERY_END})을 벗어났어요.` },
          { status: 400 }
        );
      // 차단일 검사 — 관리자가 직접 막아둔 날이므로 실수 예약을 방지
      const { data: blocked } = await supabaseAdmin
        .from("blocked_dates")
        .select("date")
        .eq("date", body.date)
        .maybeSingle();
      if (blocked)
        return NextResponse.json(
          { error: "차단된 날짜예요. 캘린더 탭에서 차단을 해제한 뒤 변경하세요." },
          { status: 409 }
        );
      // 하루 1건 원칙 — 다른 활성 주문과 충돌 검사 (자기 자신 제외)
      const { data: clash } = await supabaseAdmin
        .from("deliveries")
        .select("id")
        .eq("date", body.date)
        .neq("status", "취소")
        .neq("id", id)
        .limit(1);
      if (clash && clash.length > 0)
        return NextResponse.json(
          { error: "해당 날짜에 이미 다른 주문이 있어요." },
          { status: 409 }
        );
      patch.date = body.date;
    }
    if (body.time_slot !== undefined) {
      if (!["오전", "오후", "저녁"].includes(body.time_slot))
        return NextResponse.json({ error: "시간대가 올바르지 않습니다." }, { status: 400 });
      if (
        body.date &&
        !slotsForDate(body.date).includes(body.time_slot as TimeSlot)
      )
        return NextResponse.json(
          { error: "해당 날짜에 선택할 수 없는 시간대예요." },
          { status: 400 }
        );
      patch.time_slot = body.time_slot;
    }
    if (body.location !== undefined) {
      const loc = String(body.location).trim().slice(0, 200);
      if (!loc)
        return NextResponse.json({ error: "장소를 입력해 주세요." }, { status: 400 });
      patch.location = loc;
    }
    patch.updated_at = new Date().toISOString();
  }

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

    // 확정 감사 문자 커스텀 템플릿 (LC-2) — 관리자가 콘텐츠 탭에서 설정, 없으면 기본
    let confirmTpl = "";
    if (patch.status === "확정") {
      const { data: st } = await supabaseAdmin
        .from("site_settings")
        .select("value")
        .eq("key", "confirm_sms")
        .maybeSingle();
      if (typeof st?.value === "string") confirmTpl = st.value.trim();
    }
    const dateK = formatYmdKo(data.date);
    const fill = (tpl: string, name: string) =>
      tpl
        .replace(/\{이름\}/g, name)
        .replace(/\{날짜\}/g, dateK)
        .replace(/\{시간\}/g, data.time_slot)
        .replace(/\{장소\}/g, data.location ?? "");

    const targets = (parts ?? []) as { name: string; phone: string }[];
    const results = await Promise.all(
      targets.map((p) => {
        const text =
          patch.status === "확정"
            ? confirmTpl
              ? fill(confirmTpl, p.name)
              : `[청첩장 배달] ${p.name}님, 소중한 마음으로 신청해주셔서 감사합니다 🙏 ${dateK} ${data.time_slot} ${data.location}(으)로 찾아뵙겠습니다. 곧 만나요!`
            : `[청첩장 배달] ${p.name}님, 부득이하게 ${dateK} ${data.time_slot} 일정이 취소되었습니다. 자세한 안내는 곧 연락드리겠습니다. 양해 부탁드립니다.`;
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

  // 배송 완료 → 리뷰요청 문자 (DL-3) — 개인 리뷰 링크(manage) 포함
  if (data && patch.status === "완료") {
    const { data: parts } = await supabaseAdmin
      .from("participants")
      .select("id, name, phone")
      .eq("delivery_id", id)
      .not("phone", "is", null);

    let reviewTpl = "";
    const { data: st } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", "review_sms")
      .maybeSingle();
    if (typeof st?.value === "string") reviewTpl = st.value.trim();

    const origin = new URL(req.url).origin;
    const dateK = formatYmdKo(data.date);
    const targets = (parts ?? []) as { id: string; name: string; phone: string }[];
    const results = await Promise.all(
      targets.map((p) => {
        const link = `${origin}/delivery/manage/${p.id}`;
        const fill = (tpl: string) =>
          tpl
            .replace(/\{이름\}/g, p.name)
            .replace(/\{날짜\}/g, dateK)
            .replace(/\{시간\}/g, data.time_slot)
            .replace(/\{장소\}/g, data.location ?? "")
            .replace(/\{링크\}/g, link);
        const text = reviewTpl
          ? fill(reviewTpl)
          : `[청첩장 배달] ${p.name}님, 청첩장 잘 받으셨나요? 😊 짧은 한줄 후기를 남겨주시면 큰 힘이 됩니다 🙏 ${link}`;
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

  // 일정 변경 → 참여자 전원에게 변경 안내 SMS (notify=false 로 생략 가능)
  if (data && scheduleChange && body.notify !== false) {
    const { data: parts } = await supabaseAdmin
      .from("participants")
      .select("name, phone")
      .eq("delivery_id", id)
      .not("phone", "is", null);

    const dateK = formatYmdKo(data.date);
    const targets = (parts ?? []) as { name: string; phone: string }[];
    const results = await Promise.all(
      targets.map((p) =>
        sendSms(
          p.phone,
          `[청첩장 배달] ${p.name}님, 배달 일정이 변경되었어요 🛵 ${dateK} ${data.time_slot} · ${data.location ?? ""} 에서 찾아뵙겠습니다. 문의는 이 번호로 연락주세요!`
        ).then((r) => ({ name: p.name, ...r }))
      )
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
