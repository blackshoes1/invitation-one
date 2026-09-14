import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!UUID.test(id) || typeof body?.member_id !== "string" || !UUID.test(body.member_id))
    return NextResponse.json({ error: "주문과 명단의 개인을 선택해주세요." }, { status: 400 });
  const { data, error } = await supabaseAdmin!.rpc("admin_add_order_member_v1", {
    p_delivery: id, p_member: body.member_id,
  });
  if (error) {
    const errors: Record<string, [number, string]> = {
      order_not_found: [404, "주문을 찾을 수 없습니다."],
      member_not_found: [404, "명단에서 삭제된 개인입니다. 명단을 다시 열어주세요."],
      group_mismatch: [409, "이 주문과 같은 그룹의 개인만 추가할 수 있습니다."],
      invalid_status: [409, "취소·완료된 주문에는 추가할 수 없습니다."],
      already_ordered: [409, "이미 다른 주문에 참여 중입니다. 주문 합치기를 이용해주세요."],
      identity_conflict: [409, "이름·연락처가 같은 기존 참여자가 있습니다. 명단 연결을 확인해주세요."],
    };
    const known = errors[error.message];
    return NextResponse.json({ error: known?.[1] ?? "추가하지 못했습니다. 잠시 후 다시 시도해주세요." }, { status: known?.[0] ?? 500 });
  }
  return NextResponse.json({ result: data });
}
