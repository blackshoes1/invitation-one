import { adminGuard } from "@/lib/adminAuth";
import { attendMember } from "@/lib/adminAttend";

/**
 * 관리자 — 그룹 명단 사람을 참석자(RSVP)로 등록(POST) / 인원·측 수정(PATCH).
 * 검증과 DB 호출은 lib/adminAttend 공용 (개별 초대 라우트와 같다).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id, memberId } = await params;
  return attendMember(req, id, memberId, "create");
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id, memberId } = await params;
  return attendMember(req, id, memberId, "update");
}
