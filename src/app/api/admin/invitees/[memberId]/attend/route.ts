import { adminGuard } from "@/lib/adminAuth";
import { attendMember } from "@/lib/adminAttend";

/**
 * 관리자 — 개별 초대(그룹에 속하지 않은 사람)를 참석자(RSVP)로 등록(POST) / 인원·측 수정(PATCH).
 * group_id 가 null 인 명단만 대상이다 (그룹 명단은 /api/admin/groups/[id]/members/[memberId]/attend).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { memberId } = await params;
  return attendMember(req, null, memberId, "create");
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { memberId } = await params;
  return attendMember(req, null, memberId, "update");
}
