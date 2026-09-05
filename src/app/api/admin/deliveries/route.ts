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

/**
 * 그룹 명단(group_members) 전원을 이 주문의 참여자로 등록 (관리자 일괄 신청 처리).
 * 이미 신청한 사람은 건너뛴다:
 *  - 이 주문에 이미 같은 이름의 참여자가 있음 (대표자 등)
 *  - 명단 연결(group_member_id)로 이미 참여자가 있음 (본인이 직접 신청)
 *  - 같은 그룹의 취소되지 않은 주문에 같은 이름의 참여자가 있음 (연결 이전 신청분)
 * 관리자가 만든 건이므로 카카오 알림은 보내지 않는다 (트리거가 적재한 outbox 행을 skipped 로 마킹).
 * 합석 정원(10명)은 하객 합류 규칙이라 관리자 일괄 등록에는 적용하지 않는다.
 */
async function addRosterParticipants(
  deliveryId: string,
  groupId: string
): Promise<{ added: number; skipped: number }> {
  const sb = supabaseAdmin!;
  const { data: roster } = await sb
    .from("group_members")
    .select("id, name, phone")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });
  if (!roster?.length) return { added: 0, skipped: 0 };

  const [{ data: onOrder }, { data: linked }, { data: inGroup }] = await Promise.all([
    sb.from("participants").select("name").eq("delivery_id", deliveryId),
    sb
      .from("participants")
      .select("group_member_id")
      .in(
        "group_member_id",
        roster.map((m) => m.id)
      ),
    sb
      .from("participants")
      .select("name, deliveries!inner(status)")
      .eq("group_id", groupId)
      .neq("deliveries.status", "취소"),
  ]);

  const norm = (v: string) => v.trim();
  const taken = new Set<string>((onOrder ?? []).map((p) => norm(p.name as string)));
  for (const p of inGroup ?? []) taken.add(norm(p.name as string));
  const linkedIds = new Set<string>(
    (linked ?? []).map((p) => p.group_member_id as string).filter(Boolean)
  );

  const rows = roster
    .filter((m) => !linkedIds.has(m.id) && !taken.has(norm(m.name)))
    .map((m) => ({
      delivery_id: deliveryId,
      group_id: groupId,
      type: "직접배달",
      name: norm(m.name),
      phone: m.phone ?? null,
      is_owner: false,
      group_member_id: m.id,
    }));
  if (rows.length === 0) return { added: 0, skipped: roster.length };

  const { data: inserted, error } = await sb
    .from("participants")
    .insert(rows)
    .select("id");
  if (error) {
    console.error("[admin/deliveries] 명단 일괄 등록 실패:", error.message);
    return { added: 0, skipped: roster.length };
  }
  const ids = (inserted ?? []).map((p) => p.id as string);
  if (ids.length > 0) {
    await sb
      .from("notification_outbox")
      .update({
        status: "skipped",
        last_error: "admin_created",
        updated_at: new Date().toISOString(),
      })
      .in("participant_id", ids)
      .eq("status", "pending");
  }
  return { added: rows.length, skipped: roster.length - rows.length };
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
  // 그룹 주문이면 명단 전원을 신청 처리 (기본 동작 — 체크 해제 시 대표자만)
  const includeRoster = Boolean(groupId) && b.include_roster !== false;
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
      | { delivery_id: string; participant_id?: string }
      | undefined;
    // 관리자가 직접 만든 주문은 본인이 이미 아는 내용이므로 카카오 알림을 보내지 않는다.
    // (트리거가 적재한 outbox 행을 skipped 로 마킹 — 역할 추론 대신 명시적 처리)
    if (row?.participant_id) {
      await supabaseAdmin!
        .from("notification_outbox")
        .update({
          status: "skipped",
          last_error: "admin_created",
          updated_at: new Date().toISOString(),
        })
        .eq("participant_id", row.participant_id)
        .eq("status", "pending");
    }
    const roster =
      includeRoster && row?.delivery_id
        ? await addRosterParticipants(row.delivery_id, groupId!)
        : { added: 0, skipped: 0 };
    return NextResponse.json({
      delivery_id: row?.delivery_id ?? null,
      with_owner: true,
      roster_added: roster.added,
      roster_skipped: roster.skipped,
    });
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
  const roster = includeRoster
    ? await addRosterParticipants(data.id, groupId!)
    : { added: 0, skipped: 0 };
  return NextResponse.json({
    delivery_id: data.id,
    with_owner: false,
    roster_added: roster.added,
    roster_skipped: roster.skipped,
  });
}
