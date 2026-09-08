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
 * 주문 · 대표자 · 명단 일괄 등록 · 명단 연결 · 알림 제외를 **한 트랜잭션**으로
 * 처리한다 (admin_create_order_v1). 예전에는 네 번의 왕복으로 나뉘어 있어서
 *  - 중간에 실패하면 빈 주문이나 명단 일부만 등록된 주문이 남았고
 *  - 명단 insert 오류가 "전원 이미 신청됨"과 구분되지 않았으며
 *  - 알림 제외가 별도 트랜잭션이라 그 사이 드레인이 돌면 관리자 주문의 알림이
 *    실제로 발송됐다.
 * 자세한 배경은 supabase/migrations/20260907000100_admin_order_atomic.sql 참고.
 *
 * - 대표자(name+phone)를 주면 주문 + 대표 참여자를 함께 만든다. 대표자가 명단
 *   구성원으로 확실히 특정되면 중복 생성하지 않고 연결한다.
 * - 대표자를 비우면 빈 주문(슬롯)만 만든다 — 그룹 멤버가 나중에 합류할 수 있다.
 * - 날짜 규칙은 v10 이후 기준: 기간 내 + 마감일(blocked_dates)이 아니면 허용.
 * - 합석 정원(10명)은 하객 합류 규칙이라 관리자 일괄 등록에는 적용하지 않는다.
 */
const RIDERS = ["신랑", "신부", "신랑+신부"] as const;

/** 명단에서 제외/확인필요로 표시된 구성원 (사유 코드는 RPC 주석 참고) */
interface RosterNote {
  member_id: string;
  name: string;
  reason: string;
}

interface AdminOrderResult {
  delivery_id: string;
  with_owner: boolean;
  reused: boolean;
  roster: {
    added: number;
    linked: number;
    skipped: RosterNote[];
    review: RosterNote[];
  };
}

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

  const { data: blocked, error: blockedErr } = await supabaseAdmin!
    .from("blocked_dates")
    .select("date")
    .eq("date", date)
    .maybeSingle();
  // 차단일 조회가 실패했는데 통과시키면 마감한 날에 주문이 들어간다 — 막는 쪽이 안전하다.
  if (blockedErr)
    return NextResponse.json({ error: blockedErr.message }, { status: 500 });
  if (blocked)
    return NextResponse.json(
      { error: "차단된 날짜예요. 캘린더 탭에서 차단을 해제한 뒤 생성하세요." },
      { status: 409 }
    );

  const groupId = typeof b.group_id === "string" && b.group_id ? b.group_id : null;
  // 그룹 주문이면 명단 전원을 신청 처리 (기본 동작 — 체크 해제 시 대표자만)
  const includeRoster = Boolean(groupId) && b.include_roster !== false;
  const rider = RIDERS.includes(b.rider as never) ? (b.rider as string) : "신랑";
  const message = String(b.message ?? "").trim().slice(0, 300) || null;
  const ownerName = String(b.owner_name ?? "").trim().slice(0, 40);
  const ownerPhone = String(b.owner_phone ?? "").trim();

  // 멱등 키 — 같은 제출의 중복 클릭·네트워크 재시도를 흡수한다. 클라이언트가 제출
  // 1회당 하나를 만들어 보내고, 재시도할 때 같은 값을 다시 보낸다. 없으면 서버가
  // 만들어 주되(구 클라이언트 호환) 그 경우 재시도 보호는 받지 못한다.
  const requestKey =
    typeof b.request_key === "string" && b.request_key.length >= 8
      ? b.request_key.slice(0, 100)
      : crypto.randomUUID();

  if (ownerName || ownerPhone) {
    if (ownerName.length < 2)
      return NextResponse.json({ error: "대표자 성함을 2자 이상 입력해주세요." }, { status: 400 });
    if (!isValidPhone(ownerPhone))
      return NextResponse.json(
        { error: "대표자 연락처 형식을 확인해주세요 (010-0000-0000)." },
        { status: 400 }
      );
  }

  const { data, error } = await supabaseAdmin!.rpc("admin_create_order_v1", {
    p_request_key: requestKey,
    p_group_id: groupId,
    p_owner_name: ownerName || null,
    p_owner_phone: ownerName ? ownerPhone : null,
    p_location: location,
    p_date: date,
    p_time: slot,
    p_message: message,
    p_rider: rider,
    p_include_roster: includeRoster,
  });
  if (error) {
    // 예상 가능한 거절과 진짜 오류를 구분해서 내려준다 — 예전에는 명단 등록 실패가
    // 성공 응답의 skipped 인원으로 둔갑했다.
    if (error.message.includes("date_blocked"))
      return NextResponse.json(
        { error: "차단된 날짜예요. 캘린더 탭에서 차단을 해제한 뒤 생성하세요." },
        { status: 409 }
      );
    if (error.message.includes("out_of_range"))
      return NextResponse.json({ error: "배달 가능 기간을 벗어났어요." }, { status: 400 });
    console.error("[admin/deliveries] 주문 생성 실패:", error.message);
    return NextResponse.json(
      { error: "주문을 만들지 못했어요. 아무것도 저장되지 않았으니 다시 시도해주세요." },
      { status: 500 }
    );
  }

  const r = data as AdminOrderResult | null;
  if (!r?.delivery_id)
    return NextResponse.json({ error: "주문 생성 결과를 확인하지 못했어요." }, { status: 500 });

  return NextResponse.json({
    delivery_id: r.delivery_id,
    with_owner: r.with_owner,
    reused: r.reused,
    roster_added: r.roster.added,
    roster_linked: r.roster.linked,
    // 구 클라이언트가 숫자로 읽던 필드 — 사유별 목록과 함께 유지한다
    roster_skipped: r.roster.skipped.length,
    roster_skipped_detail: r.roster.skipped,
    roster_review: r.roster.review,
  });
}
