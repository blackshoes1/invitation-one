import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: Request) {
  const bad = adminGuard(req);
  if (bad) return bad;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // 대기중 | 확정 | 완료 | null(전체)
  const groupId = searchParams.get("group_id"); // 그룹 필터 | null(전체)

  // 참여 시스템: 주문 + 참여자 목록을 함께 조회
  let query = supabaseAdmin!
    .from("deliveries")
    .select("*, participants!delivery_id(*)")
    .order("date", { ascending: true });
  if (status) query = query.eq("status", status);
  if (groupId) query = query.eq("group_id", groupId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ deliveries: data });
}
