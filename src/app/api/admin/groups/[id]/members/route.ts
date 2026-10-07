import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { orderKindOf } from "@/lib/orderKind";
import { formatPhone, isValidPhone } from "@/lib/wedding";
import { isUuid } from "@/lib/checkinServer";
import { companionSlots, normalizeCompanions } from "@/lib/groupCompanions";

const MEMBER_COLS =
  "id, group_id, name, phone, invited_at, created_at, rsvp_id, companions";
/** 참석자 불러오기 1회 상한 (요청 폭주 방지) */
const MAX_ATTENDEES = 200;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id } = await params;

  const { data, error } = await supabaseAdmin!
    .from("group_members")
    .select(MEMBER_COLS)
    .eq("group_id", id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: attendanceRows, error: attendanceError } = await supabaseAdmin!
    .from("group_attendance").select("member_id, attendance, share_with_group").eq("group_id", id);
  if (attendanceError) return NextResponse.json({ error: "참석 응답 조회 실패" }, { status: 503 });
  const attendance = new Map((attendanceRows ?? []).map((r) => [r.member_id, r]));

  // 개인 링크로 신청한 사람은 그룹(group_id) 집계에 안 잡히므로, 명단에서 놓치지 않도록
  // participants.group_member_id 로 신청 여부를 함께 내려준다.
  // 종류 판정은 폼·API 와 같은 규칙을 쓴다 (src/lib/orderKind.ts).
  //
  // ⚠️ 배지는 그룹 카드 집계와 **같은 기준**을 써야 한다 (docs/COUNTING.md):
  //   - 유효한 직접배달 = 취소되지 않은 직접배달. 취소만 남은 사람은 신청자가 아니다.
  //   - 마음배송은 직접배달이 아니다. 축하 메시지를 보냈다고 "신청 완료"로 보이면
  //     관리자가 그 사람 몫의 청첩장을 준비하지 않는다.
  const ids = (data ?? []).map((m) => m.id);
  /** member_id → 유효 직접배달이 그룹 주문인지 (없으면 신청 없음) */
  const orderKind = new Map<string, "group" | "personal">();
  const hasHeart = new Set<string>();
  if (ids.length > 0) {
    // FK 가 둘이라 관계를 명시한다. 오류는 무시하지 않는다 — 조회가 실패했는데
    // 배지를 비워 두면 "아무도 신청 안 함"으로 잘못 읽힌다.
    const { data: parts, error: pErr } = await supabaseAdmin!
      .from("participants")
      .select("group_member_id, group_id, type, delivery:deliveries!delivery_id(status)")
      .in("group_member_id", ids);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    for (const p of (parts ?? []) as unknown as {
      group_member_id: string | null;
      group_id: string | null;
      type: string;
      delivery: { status: string } | null;
    }[]) {
      if (!p.group_member_id) continue;
      if (p.type === "마음배송") {
        hasHeart.add(p.group_member_id);
        continue;
      }
      if (p.delivery?.status === "취소") continue;
      // 하나라도 그룹 주문이면 그룹 신청으로 표시
      const kind = orderKindOf(p.group_id);
      if (kind === "group" || !orderKind.has(p.group_member_id))
        orderKind.set(p.group_member_id, kind);
    }
  }
  const members = (data ?? []).map((m) => ({
    ...m,
    /** 유효한 직접배달 신청이 있는가 (취소·마음배송은 제외) */
    applied: orderKind.has(m.id),
    /** 신청했지만 그룹에 묶이지 않은 개인 주문인지 */
    personal: orderKind.get(m.id) === "personal",
    /** 마음배송 기록이 있는가 — 직접배달 신청과 별개로 표시한다 */
    heart: hasHeart.has(m.id),
    /** 결혼식 참석 응답 — 청첩장 신청과 별도다 */
    attendance: attendance.get(m.id)?.attendance ?? null,
    attendance_shared: attendance.get(m.id)?.share_with_group ?? false,
  }));
  return NextResponse.json({ members });
}

/**
 * POST — 명단 추가
 *  - { name }                         : 직접 이름 추가
 *  - { attendees: [{rsvp_id, companions?}] } : RSVP 참석자 불러오기 (이름은 서버가 RSVP 에서 읽음,
 *    참석(attending)이 아니거나 이미 이 그룹에 있는 사람은 건너뜀)
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    attendees?: { rsvp_id?: string; companions?: unknown }[];
  };

  if (Array.isArray(body.attendees)) {
    const picked = new Map<string, unknown>();
    for (const a of body.attendees.slice(0, MAX_ATTENDEES)) {
      if (a?.rsvp_id && isUuid(a.rsvp_id)) picked.set(a.rsvp_id, a.companions);
    }
    if (picked.size === 0)
      return NextResponse.json({ error: "추가할 참석자를 선택해주세요." }, { status: 400 });
    const ids = [...picked.keys()];

    const [rsvpRes, existRes] = await Promise.all([
      supabaseAdmin!
        .from("rsvp")
        .select("id, name, attending, companion_count")
        .in("id", ids)
        .eq("attending", true),
      supabaseAdmin!
        .from("group_members")
        .select("rsvp_id")
        .eq("group_id", id)
        .in("rsvp_id", ids),
    ]);
    const err = rsvpRes.error ?? existRes.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    const already = new Set((existRes.data ?? []).map((m) => m.rsvp_id as string));
    const rows = (rsvpRes.data ?? [])
      .filter((r) => !already.has(r.id))
      .map((r) => {
        const given = picked.get(r.id);
        return {
          group_id: id,
          rsvp_id: r.id,
          name: r.name,
          companions: Array.isArray(given)
            ? normalizeCompanions(given)
            : Array<string>(companionSlots(1 + (r.companion_count ?? 0))).fill(""),
        };
      });
    if (rows.length === 0)
      return NextResponse.json({ members: [], skipped: ids.length });

    const { data, error } = await supabaseAdmin!
      .from("group_members")
      .insert(rows)
      .select(MEMBER_COLS);
    if (error) {
      // 동시 요청으로 같은 참석자가 이미 들어간 경우 (unique 위반)
      const status = error.code === "23505" ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({
      members: data ?? [],
      skipped: ids.length - (data?.length ?? 0),
    });
  }

  const { name } = body;
  if (!name?.trim())
    return NextResponse.json({ error: "이름을 입력해주세요." }, { status: 400 });

  const { data, error } = await supabaseAdmin!
    .from("group_members")
    .insert({ group_id: id, name: name.trim() })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  await params; // id 는 사용하지 않지만 시그니처 유지

  const memberId = new URL(req.url).searchParams.get("member_id");
  if (!memberId)
    return NextResponse.json({ error: "member_id 가 필요합니다." }, { status: 400 });

  const { error } = await supabaseAdmin!
    .from("group_members")
    .delete()
    .eq("id", memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * 명단 수정 — 보낸 필드만 반영한다.
 *  - phone      : 개인 초대 링크용 연락처. 빈 값이면 삭제
 *  - companions : 동반자 이름 배열 (빈 문자열 = 이름 미입력 칸)
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    member_id?: string;
    phone?: string | null;
    companions?: unknown;
  };
  const { member_id } = body;
  if (!member_id)
    return NextResponse.json({ error: "member_id 가 필요합니다." }, { status: 400 });

  const patch: { phone?: string | null; companions?: string[] } = {};
  if ("phone" in body) {
    const raw = String(body.phone ?? "").trim();
    const norm = raw ? formatPhone(raw) : null;
    if (norm && !isValidPhone(norm))
      return NextResponse.json({ error: "연락처 형식을 확인해주세요 (010-0000-0000)." }, { status: 400 });
    patch.phone = norm;
  }
  if ("companions" in body) {
    if (!Array.isArray(body.companions))
      return NextResponse.json({ error: "companions 는 배열이어야 합니다." }, { status: 400 });
    patch.companions = normalizeCompanions(body.companions);
  }
  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "수정할 항목이 없습니다." }, { status: 400 });

  const { data, error } = await supabaseAdmin!
    .from("group_members")
    .update(patch)
    .eq("id", member_id)
    .eq("group_id", id)
    .select(MEMBER_COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ member: data });
}
