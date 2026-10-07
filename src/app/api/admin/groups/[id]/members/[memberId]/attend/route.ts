import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/checkinServer";
import { formatPhone, isValidPhone } from "@/lib/wedding";
import {
  clampCompanionCount,
  normalizeCompanions,
  resizeCompanions,
} from "@/lib/groupCompanions";

/**
 * 관리자 — 그룹 명단 사람을 참석자(RSVP)로 등록.
 * 이름은 명단에서 DB 가 읽는다 (클라이언트 값을 쓰지 않음). 등록·연결은 한 트랜잭션 (admin_attend_member_v1).
 *  - created : 새 참석 RSVP 를 만들고 명단과 연결 (QR 토큰 발급)
 *  - linked  : 같은 이름·연락처의 RSVP 가 이미 있어 덮어쓰지 않고 연결만 함
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id, memberId } = await params;
  if (!isUuid(id) || !isUuid(memberId))
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const body = (await req.json().catch(() => null)) as {
    side?: unknown;
    phone?: unknown;
    companionCount?: unknown;
    companionNames?: unknown;
  } | null;
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  if (body.side !== "groom" && body.side !== "bride")
    return NextResponse.json({ error: "신랑측/신부측을 선택해주세요." }, { status: 400 });

  const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
  const phone = rawPhone ? formatPhone(rawPhone) : null;
  if (phone && !isValidPhone(phone))
    return NextResponse.json({ error: "연락처 형식을 확인해주세요 (010-0000-0000)." }, { status: 400 });

  const count = clampCompanionCount(body.companionCount);
  const names = resizeCompanions(normalizeCompanions(body.companionNames), count);

  const { data, error } = await supabaseAdmin!.rpc("admin_attend_member_v1", {
    p_group: id,
    p_member: memberId,
    p_side: body.side,
    p_phone: phone,
    p_companions: count,
    p_names: names,
  });
  if (error) {
    if (error.code === "23505" || error.message === "already_registered")
      return NextResponse.json({ error: "이미 참석자로 등록된 사람이에요." }, { status: 409 });
    if (error.message === "member_not_found")
      return NextResponse.json({ error: "명단에서 찾을 수 없어요." }, { status: 404 });
    if (error.message === "invalid_side")
      return NextResponse.json({ error: "신랑측/신부측을 선택해주세요." }, { status: 400 });
    console.error("[admin attend] admin_attend_member_v1 실패:", error.message);
    return NextResponse.json({ error: "참석 등록에 실패했습니다." }, { status: 500 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { result: string; rsvp_id: string }
    | undefined;
  if (!row) return NextResponse.json({ error: "참석 등록에 실패했습니다." }, { status: 500 });
  return NextResponse.json({ result: row.result, rsvp_id: row.rsvp_id });
}
