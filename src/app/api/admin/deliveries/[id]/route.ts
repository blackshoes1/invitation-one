import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendSms, isSmsConfigured } from "@/lib/sms";
import { rotateManageToken, manageUrl } from "@/lib/manageToken";
import {
  formatYmdKo,
  slotsForDate,
  TIME_SLOTS,
  INVITATION_KEY,
  DELIVERY_START,
  DELIVERY_END,
} from "@/lib/wedding";
import type { TimeSlot } from "@/lib/wedding";
import type { DeliveryStatus, TrackingStage } from "@/lib/supabase";
import { siteOrigin } from "@/lib/siteUrl";

const VALID: DeliveryStatus[] = ["대기중", "확정", "완료", "취소"];
const VALID_STAGE: TrackingStage[] = ["주문접수", "준비중", "배송출발", "배송완료"];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { id } = await params;
  const body = (await req.json()) as {
    status?: DeliveryStatus;
    tracking_stage?: TrackingStage;
    // 일정 수정 (그룹 담당자가 신청한 일자·시간·장소를 관리자가 조정)
    date?: string;
    time_slot?: string;
    location?: string;
    notify?: boolean; // 일정 변경 시 참여자 SMS 안내 여부 (기본 true)
    /** 표시 전용 숨김 — DB 는 보존하고 관리자 목록에서만 감춘다 */
    hidden?: boolean;
  };

  const patch: {
    status?: DeliveryStatus;
    tracking_stage?: TrackingStage;
    date?: string;
    time_slot?: string;
    location?: string;
    hidden?: boolean;
    updated_at?: string;
  } = {};

  if (body.hidden !== undefined) {
    patch.hidden = Boolean(body.hidden);
    patch.updated_at = new Date().toISOString();
  }

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
      const { data: blocked } = await supabaseAdmin!
        .from("blocked_dates")
        .select("date")
        .eq("date", body.date)
        .maybeSingle();
      if (blocked)
        return NextResponse.json(
          { error: "차단된 날짜예요. 캘린더 탭에서 차단을 해제한 뒤 변경하세요." },
          { status: 409 }
        );
      // ※ 같은 날짜 중복 주문은 허용된다 (v10_multi_orders 에서 하루 1건 제한 폐지 —
      //    마감은 blocked_dates 로만 관리). 예전 규칙대로 중복 검사를 하면 같은 날
      //    다른 주문이 있는 건의 일정 수정이 전부 409 로 막혀 저장이 안 된다.
      patch.date = body.date;
    }
    if (body.time_slot !== undefined) {
      if (!TIME_SLOTS.includes(body.time_slot as TimeSlot))
        return NextResponse.json({ error: "시간대가 올바르지 않습니다." }, { status: 400 });
      // 날짜를 함께 바꾸지 않으면 기존 날짜 기준으로 검사 (평일에 오전/오후 방지)
      let effectiveDate = body.date;
      if (!effectiveDate) {
        const { data: cur } = await supabaseAdmin!
          .from("deliveries")
          .select("date")
          .eq("id", id)
          .maybeSingle();
        effectiveDate = cur?.date as string | undefined;
      }
      if (
        effectiveDate &&
        !slotsForDate(effectiveDate).includes(body.time_slot as TimeSlot)
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

  // 상태 변경은 "실제 전이"일 때만 반영·발송 (멱등).
  // 같은 상태로 재요청(더블탭·네트워크 재시도)해도 SMS 가 중복 발송되지 않도록
  // .neq("status", …) 로 원자적으로 가드한다. 매치 0행이면 이미 그 상태이거나 없는 id.
  let statusChanged = false;
  let data: Record<string, unknown> & { date: string; time_slot: string; location: string | null };
  if (patch.status !== undefined) {
    const upd = await supabaseAdmin!
      .from("deliveries")
      .update(patch)
      .eq("id", id)
      .neq("status", patch.status)
      .select()
      .maybeSingle();
    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }
    if (upd.data) {
      statusChanged = true;
      data = upd.data;
    } else {
      // 이미 해당 상태(중복 요청)거나 존재하지 않는 id — 현재 행으로 구분
      const cur = await supabaseAdmin!
        .from("deliveries")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cur.error) {
        return NextResponse.json({ error: cur.error.message }, { status: 500 });
      }
      if (!cur.data) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      data = cur.data;
    }
  } else {
    // 추적 단계만 변경
    const upd = await supabaseAdmin!
      .from("deliveries")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 500 });
    }
    if (!upd.data) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    data = upd.data;
  }

  // 상태 전이 시 참여자 전원에게 SMS (참여 시스템 — 연락처 보유자 대상, 키 없으면 자동 skip)
  let sms: unknown = null;
  const origin = siteOrigin(req);
  // 문자에 넣는 청첩장 링크 — 카톡이 밀려도 문자함에 남아 재방문 경로가 된다
  const invitationUrl = INVITATION_KEY ? `${origin}/?key=${INVITATION_KEY}` : origin;
  if (statusChanged && (patch.status === "확정" || patch.status === "취소")) {
    const { data: parts } = await supabaseAdmin!
      .from("participants")
      .select("name, phone")
      .eq("delivery_id", id)
      .not("phone", "is", null);

    // 확정 감사 문자 커스텀 템플릿 (LC-2) — 관리자가 콘텐츠 탭에서 설정, 없으면 기본
    let confirmTpl = "";
    if (patch.status === "확정") {
      const { data: st } = await supabaseAdmin!
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
        .replace(/\{장소\}/g, data.location ?? "")
        .replace(/\{청첩장\}/g, invitationUrl);

    const targets = (parts ?? []) as { name: string; phone: string }[];
    const results = await Promise.all(
      targets.map((p) => {
        const text =
          patch.status === "확정"
            ? confirmTpl
              ? fill(confirmTpl, p.name)
              : `[청첩장 배달] ${p.name}님, 소중한 마음으로 신청해주셔서 감사합니다 🙏 ${dateK} ${data.time_slot} ${data.location}(으)로 찾아뵙겠습니다. 곧 만나요!\n💌 청첩장 다시 보기: ${invitationUrl}`
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

  // 배송 완료 전이 → 리뷰요청 문자 (DL-3) — 개인 리뷰 링크(manage) 포함
  if (statusChanged && patch.status === "완료") {
    const { data: parts } = await supabaseAdmin!
      .from("participants")
      .select("id, name, phone")
      .eq("delivery_id", id)
      .not("phone", "is", null);

    let reviewTpl = "";
    const { data: st } = await supabaseAdmin!
      .from("site_settings")
      .select("value")
      .eq("key", "review_sms")
      .maybeSingle();
    if (typeof st?.value === "string") reviewTpl = st.value.trim();

    const dateK = formatYmdKo(data.date);
    const targets = (parts ?? []) as { id: string; name: string; phone: string }[];
    const results = await Promise.all(
      targets.map(async (p) => {
        // 관리 링크는 토큰 기반 (P0-2). SMS 가 실제 나갈 때만 토큰을 회전 발급해
        // 미설정 환경에서 기존 링크가 무효화되지 않도록 함.
        const tok = isSmsConfigured ? await rotateManageToken(p.id) : null;
        const link = tok ? manageUrl(origin, tok) : `${origin}/delivery`;
        const fill = (tpl: string) =>
          tpl
            .replace(/\{이름\}/g, p.name)
            .replace(/\{날짜\}/g, dateK)
            .replace(/\{시간\}/g, data.time_slot)
            .replace(/\{장소\}/g, data.location ?? "")
            .replace(/\{링크\}/g, link)
            .replace(/\{청첩장\}/g, invitationUrl);
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
    const { data: parts } = await supabaseAdmin!
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
