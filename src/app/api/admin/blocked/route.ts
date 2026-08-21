import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** 차단된 날짜 목록 */
export async function GET(req: Request) {
  const bad = await adminGuard(req);
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

/**
 * 날짜 마감/해제 (다중 선택 지원)
 * body: { dates: 'YYYY-MM-DD'[], block: boolean }
 * - 주문이 있는 날짜도 마감 가능 (신규 신청만 막힘, 기존 주문은 유지)
 */
export async function POST(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { dates, block } = (await req.json()) as {
    dates?: string[];
    block?: boolean;
  };
  const valid = (dates ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (valid.length === 0 || typeof block !== "boolean")
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });

  if (!block) {
    const { error } = await supabaseAdmin!
      .from("blocked_dates")
      .delete()
      .in("date", valid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ done: valid.length });
  }

  const { error } = await supabaseAdmin!
    .from("blocked_dates")
    .upsert(valid.map((date) => ({ date })));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ done: valid.length });
}
