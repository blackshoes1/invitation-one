import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 주문 합치기 — source 주문의 참여자를 target 주문으로 이동하고 source 는 취소.
 * (1인 주문이 여러 건 들어온 날, 합석 확인 후 관리자가 한 주문으로 병합)
 * 동일인(이름 + 연락처 숫자 동일)이 양쪽에 있으면 한 건으로 합친다 — source 쪽
 * 중복 행은 제거되고 target 의 기존 행만 남는다 (deduped 로 건수 반환).
 * body: { source_id: string, target_id: string }
 */
export async function POST(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { source_id, target_id } = (await req.json().catch(() => ({}))) as {
    source_id?: string;
    target_id?: string;
  };
  if (!source_id || !target_id || source_id === target_id)
    return NextResponse.json({ error: "요청이 올바르지 않습니다." }, { status: 400 });

  // 참여자 이동 + source 취소를 단일 트랜잭션으로 (v25 RPC).
  // 검사~이동 사이 race 와 "이동됐는데 취소 실패" 반쪽 상태를 방지.
  const { data, error } = await supabaseAdmin!.rpc(
    "admin_merge_deliveries",
    { p_source: source_id, p_target: target_id }
  );
  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("not_found"))
      return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
    if (msg.includes("invalid_status"))
      return NextResponse.json(
        { error: "취소/완료된 주문은 합칠 수 없습니다." },
        { status: 409 }
      );
    if (msg.includes("same_order"))
      return NextResponse.json({ error: "요청이 올바르지 않습니다." }, { status: 400 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // v2 RPC: { moved, deduped }. (구 RPC 는 integer 를 그대로 반환했으므로 호환 처리)
  const row = (Array.isArray(data) ? data[0] : data) as
    | { moved?: number; deduped?: number }
    | number
    | null;
  const moved = typeof row === "number" ? row : (row?.moved ?? 0);
  const deduped = typeof row === "number" ? 0 : (row?.deduped ?? 0);
  return NextResponse.json({ moved, deduped });
}
