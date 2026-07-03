import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

function guard(req: Request) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json(
      { error: "Supabase service role key 가 설정되지 않았습니다." },
      { status: 503 }
    );
  return null;
}

/** 차단된 날짜 목록 */
export async function GET(req: Request) {
  const bad = guard(req);
  if (bad) return bad;

  const { data, error } = await supabaseAdmin!
    .from("blocked_dates")
    .select("date")
    .order("date");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    dates: (data ?? []).map((r: { date: string }) => r.date),
  });
}

/** 날짜 차단 토글 — body: { date: 'YYYY-MM-DD' } */
export async function POST(req: Request) {
  const bad = guard(req);
  if (bad) return bad;

  const { date } = (await req.json()) as { date?: string };
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: "날짜 형식이 올바르지 않습니다." }, { status: 400 });

  // 이미 주문이 있는 날짜는 차단 불가 (주문 취소로 처리해야 함)
  const { data: existing } = await supabaseAdmin!
    .from("deliveries")
    .select("id")
    .eq("date", date)
    .neq("status", "취소")
    .limit(1);
  if ((existing ?? []).length > 0)
    return NextResponse.json(
      { error: "이미 주문이 있는 날짜예요. 주문을 먼저 취소해주세요." },
      { status: 409 }
    );

  const { data: cur } = await supabaseAdmin!
    .from("blocked_dates")
    .select("date")
    .eq("date", date)
    .limit(1);

  if ((cur ?? []).length > 0) {
    const { error } = await supabaseAdmin!
      .from("blocked_dates")
      .delete()
      .eq("date", date);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ blocked: false });
  }

  const { error } = await supabaseAdmin!.from("blocked_dates").insert({ date });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blocked: true });
}
