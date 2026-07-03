import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

/**
 * 주문 합치기 — source 주문의 참여자를 target 주문으로 이동하고 source 는 취소.
 * (1인 주문이 여러 건 들어온 날, 합석 확인 후 관리자가 한 주문으로 병합)
 * body: { source_id: string, target_id: string }
 */
export async function POST(req: Request) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json(
      { error: "Supabase service role key 가 설정되지 않았습니다." },
      { status: 503 }
    );

  const { source_id, target_id } = (await req.json()) as {
    source_id?: string;
    target_id?: string;
  };
  if (!source_id || !target_id || source_id === target_id)
    return NextResponse.json({ error: "요청이 올바르지 않습니다." }, { status: 400 });

  const { data: orders, error: oErr } = await supabaseAdmin
    .from("deliveries")
    .select("id, status, date, time_slot")
    .in("id", [source_id, target_id]);
  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });

  const source = orders?.find((o) => o.id === source_id);
  const target = orders?.find((o) => o.id === target_id);
  if (!source || !target)
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  if (source.status === "취소" || target.status === "취소" || target.status === "완료")
    return NextResponse.json(
      { error: "취소/완료된 주문은 합칠 수 없습니다." },
      { status: 409 }
    );

  // 참여자 이동 (대표 자격은 target 쪽 유지)
  const { data: moved, error: mErr } = await supabaseAdmin
    .from("participants")
    .update({ delivery_id: target_id, is_owner: false, updated_at: new Date().toISOString() })
    .eq("delivery_id", source_id)
    .select("id");
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  // 빈 source 주문 취소
  const { error: cErr } = await supabaseAdmin
    .from("deliveries")
    .update({ status: "취소", updated_at: new Date().toISOString() })
    .eq("id", source_id);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  return NextResponse.json({ moved: (moved ?? []).length });
}
