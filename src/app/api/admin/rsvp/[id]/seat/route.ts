import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/checkinServer";

/**
 * 관리자 — RSVP 좌석 배정/이동/해제 (§5.2)
 * PATCH { tableId: uuid | null }
 * 정원 초과는 허용하되 응답에 경고를 담는다 (§5.3, §9-10).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = adminGuard(req);
  if (bad) return bad;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    tableId?: string | null;
  };
  if (body.tableId !== null && !isUuid(body.tableId))
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  if (body.tableId) {
    const { data: tbl } = await supabaseAdmin!
      .from("seating_tables")
      .select("id, active")
      .eq("id", body.tableId)
      .maybeSingle();
    if (!tbl)
      return NextResponse.json({ error: "테이블이 없습니다." }, { status: 404 });
    if (!tbl.active)
      return NextResponse.json(
        { error: "비활성 테이블에는 배정할 수 없어요." },
        { status: 400 }
      );
  }

  const { data, error } = await supabaseAdmin!
    .from("rsvp")
    .update({ table_id: body.tableId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, table_id, companion_count")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 정원 초과 경고 계산
  let overCapacity = false;
  if (body.tableId) {
    const [{ data: tbl }, { data: mates }] = await Promise.all([
      supabaseAdmin!
        .from("seating_tables")
        .select("capacity")
        .eq("id", body.tableId)
        .maybeSingle(),
      supabaseAdmin!
        .from("rsvp")
        .select("companion_count")
        .eq("table_id", body.tableId)
        .eq("attending", true),
    ]);
    const assigned = (mates ?? []).reduce((s, r) => s + 1 + r.companion_count, 0);
    overCapacity = Boolean(tbl && assigned > tbl.capacity);
  }

  return NextResponse.json({ rsvp: data, overCapacity });
}
