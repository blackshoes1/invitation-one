import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  slotsForDate,
  TIME_SLOTS,
  DELIVERY_START,
  DELIVERY_END,
  isValidPhone,
} from "@/lib/wedding";
import type { TimeSlot } from "@/lib/wedding";

export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // 대기중 | 확정 | 완료 | null(전체)
  const groupId = searchParams.get("group_id"); // 그룹 필터 | null(전체)
  // 숨김 처리한 주문은 기본적으로 제외 (DB 는 보존 — 표시 전용 플래그).
  // include_hidden=1 이면 숨김 건까지 반환 (주문 탭의 '숨김 포함 보기').
  const includeHidden = searchParams.get("include_hidden") === "1";

  // 참여 시스템: 주문 + 참여자 목록을 함께 조회
  let query = supabaseAdmin!
    .from("deliveries")
    .select("*, participants!delivery_id(*)")
    .order("date", { ascending: true });
  if (status) query = query.eq("status", status);
  if (groupId) query = query.eq("group_id", groupId);
  if (!includeHidden) query = query.eq("hidden", false);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ deliveries: data });
}

/**
 * 관리자 주문 생성 — 그룹 탭에서 담당자 대신 주문을 만든다 (전화·카톡 접수 대응).
 * 생성된 주문은 캘린더·주문 목록에 일반 주문과 동일하게 표시된다.
 *
 * - 대표자(name+phone)를 주면 create_delivery_v2 RPC 로 주문 + 대표 참여자를
 *   원자적으로 생성한다 (하객이 직접 신청한 것과 같은 구조 · 관리 토큰 흐름 동일).
 * - 대표자를 비우면 빈 주문(슬롯)만 만든다 — 그룹 멤버가 나중에 합류할 수 있다.
 * - 날짜 규칙은 v10 이후 기준: 기간 내 + 마감일(blocked_dates)이 아니면 허용
 *   (같은 날 여러 주문 허용).
 */
const RIDERS = ["신랑", "신부", "신랑+신부"] as const;

export async function POST(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const date = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
  if (!date)
    return NextResponse.json({ error: "날짜를 선택해주세요." }, { status: 400 });
  if (date < DELIVERY_START || date > DELIVERY_END)
    return NextResponse.json(
      { error: `배달 가능 기간(${DELIVERY_START}~${DELIVERY_END})을 벗어났어요.` },
      { status: 400 }
    );

  const slot = TIME_SLOTS.includes(b.time_slot as TimeSlot)
    ? (b.time_slot as TimeSlot)
    : null;
  if (!slot)
    return NextResponse.json({ error: "시간대를 선택해주세요." }, { status: 400 });
  if (!slotsForDate(date).includes(slot))
    return NextResponse.json(
      { error: "해당 날짜에 선택할 수 없는 시간대예요." },
      { status: 400 }
    );

  const location = String(b.location ?? "").trim().slice(0, 200);
  if (location.length < 2)
    return NextResponse.json({ error: "배송지를 입력해주세요." }, { status: 400 });

  const { data: blocked } = await supabaseAdmin!
    .from("blocked_dates")
    .select("date")
    .eq("date", date)
    .maybeSingle();
  if (blocked)
    return NextResponse.json(
      { error: "차단된 날짜예요. 캘린더 탭에서 차단을 해제한 뒤 생성하세요." },
      { status: 409 }
    );

  const groupId = typeof b.group_id === "string" && b.group_id ? b.group_id : null;
  const rider = RIDERS.includes(b.rider as never) ? (b.rider as string) : "신랑";
  const message = String(b.message ?? "").trim().slice(0, 300) || null;
  const ownerName = String(b.owner_name ?? "").trim().slice(0, 40);
  const ownerPhone = String(b.owner_phone ?? "").trim();

  // 대표자 있음 → 주문 + 대표 참여자 (하객 신청과 동일 경로)
  if (ownerName || ownerPhone) {
    if (ownerName.length < 2)
      return NextResponse.json({ error: "대표자 성함을 2자 이상 입력해주세요." }, { status: 400 });
    if (!isValidPhone(ownerPhone))
      return NextResponse.json(
        { error: "대표자 연락처 형식을 확인해주세요 (010-0000-0000)." },
        { status: 400 }
      );
    const { data, error } = await supabaseAdmin!.rpc("create_delivery_v2", {
      p_group_id: groupId,
      p_name: ownerName,
      p_phone: ownerPhone,
      p_location: location,
      p_date: date,
      p_time: slot,
      p_message: message,
      p_convert: null,
      p_rider: rider,
    });
    if (error) {
      const msg = error.message.includes("date_taken")
        ? "마감된 날짜예요."
        : error.message.includes("out_of_range")
          ? "배달 가능 기간을 벗어났어요."
          : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { delivery_id: string }
      | undefined;
    return NextResponse.json({ delivery_id: row?.delivery_id ?? null, with_owner: true });
  }

  // 대표자 없음 → 빈 주문(슬롯)만 생성. 그룹 멤버가 나중에 합류.
  const { data, error } = await supabaseAdmin!
    .from("deliveries")
    .insert({
      group_id: groupId,
      location,
      date,
      time_slot: slot,
      message,
      rider,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ delivery_id: data.id, with_owner: false });
}
