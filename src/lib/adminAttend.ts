import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/checkinServer";
import { formatPhone, isValidPhone } from "@/lib/wedding";
import {
  clampCompanionCount,
  normalizeCompanions,
  resizeCompanions,
} from "@/lib/groupCompanions";

/**
 * 관리자 — 명단 사람을 참석자(RSVP)로 등록/수정하는 라우트 공용 로직.
 * 그룹 명단(`/api/admin/groups/[id]/members/[memberId]/attend`)과
 * 개별 초대(`/api/admin/invitees/[memberId]/attend`)가 같이 쓴다. 호출 전에 adminGuard 를 통과해야 한다.
 *
 * groupId 가 uuid 면 그 그룹 명단만, null 이면 그룹 없는 개별 초대만 대상이다 —
 * DB 함수가 `group_id is not distinct from p_group` 으로 가르므로 서로의 명단을 건드릴 수 없다.
 *
 *  - create : 이름은 명단에서 DB 가 읽는다(클라이언트 값 무시). 새 참석 RSVP 를 만들고 연결 (created),
 *             같은 이름·연락처의 RSVP 가 이미 있으면 덮어쓰지 않고 연결만 (linked)
 *  - update : 측·동반 인원·동반자 이름만 수정. 연락처는 받지 않는다 (RSVP 식별 키)
 */
export type AttendMode = "create" | "update";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function attendMember(
  req: Request,
  groupId: string | null,
  memberId: string,
  mode: AttendMode
): Promise<NextResponse> {
  if ((groupId !== null && !isUuid(groupId)) || !isUuid(memberId))
    return fail("잘못된 요청입니다.", 400);

  const body = (await req.json().catch(() => null)) as {
    side?: unknown;
    phone?: unknown;
    companionCount?: unknown;
    companionNames?: unknown;
  } | null;
  if (!body || typeof body !== "object" || Array.isArray(body))
    return fail("잘못된 요청입니다.", 400);

  if (body.side !== "groom" && body.side !== "bride")
    return fail("신랑측/신부측을 선택해주세요.", 400);

  // 수정에서 인원수가 빠지면 0명으로 덮어쓰게 되므로 반드시 받는다
  const countGiven =
    typeof body.companionCount === "number" ||
    (typeof body.companionCount === "string" && body.companionCount.trim() !== "");
  if (mode === "update" && !countGiven)
    return fail("동반 인원수를 입력해주세요.", 400);

  const count = clampCompanionCount(body.companionCount);
  const names = resizeCompanions(normalizeCompanions(body.companionNames), count);

  if (mode === "update") {
    const { data, error } = await supabaseAdmin!.rpc("admin_update_attend_v1", {
      p_group: groupId,
      p_member: memberId,
      p_side: body.side,
      p_companions: count,
      p_names: names,
    });
    if (error) return mapError(error, "update");
    const row = (Array.isArray(data) ? data[0] : data) as { rsvp_id: string } | undefined;
    if (!row) return fail("참석 정보 수정에 실패했습니다.", 500);
    return NextResponse.json({ result: "updated", rsvp_id: row.rsvp_id });
  }

  const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
  const phone = rawPhone ? formatPhone(rawPhone) : null;
  if (phone && !isValidPhone(phone))
    return fail("연락처 형식을 확인해주세요 (010-0000-0000).", 400);

  const { data, error } = await supabaseAdmin!.rpc("admin_attend_member_v1", {
    p_group: groupId,
    p_member: memberId,
    p_side: body.side,
    p_phone: phone,
    p_companions: count,
    p_names: names,
  });
  if (error) return mapError(error, "create");
  const row = (Array.isArray(data) ? data[0] : data) as
    | { result: string; rsvp_id: string }
    | undefined;
  if (!row) return fail("참석 등록에 실패했습니다.", 500);
  return NextResponse.json({ result: row.result, rsvp_id: row.rsvp_id });
}

/** DB 예외 → 사용자 메시지. 내부 메시지는 로그에만 남기고 응답에 싣지 않는다 */
function mapError(error: { code?: string; message?: string }, mode: AttendMode): NextResponse {
  if (error.code === "23505" || error.message === "already_registered")
    return fail("이미 참석자로 등록된 사람이에요.", 409);
  if (error.message === "member_not_found") return fail("명단에서 찾을 수 없어요.", 404);
  if (error.message === "invalid_side") return fail("신랑측/신부측을 선택해주세요.", 400);
  if (error.message === "not_registered")
    return fail("아직 참석자로 등록되지 않은 사람이에요.", 409);
  if (error.message === "not_attending")
    return fail("RSVP 가 불참이라 여기서 수정할 수 없어요.", 409);
  console.error(`[admin attend:${mode}] 실패:`, error.message);
  return fail(mode === "update" ? "참석 정보 수정에 실패했습니다." : "참석 등록에 실패했습니다.", 500);
}
