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

/**
 * 날짜 차단/해제 (다중 선택 지원)
 * body: { dates: 'YYYY-MM-DD'[], block: boolean }
 * - block=true: 주문 있는 날짜는 건너뛰고(skipped) 나머지 차단
 * - block=false: 선택한 날짜의 차단 해제
 */
export async function POST(req: Request) {
  const bad = guard(req);
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
    return NextResponse.json({ done: valid.length, skipped: [] });
  }

  // 이미 주문이 있는 날짜는 차단 불가 (주문 취소로 처리해야 함)
  const { data: existing } = await supabaseAdmin!
    .from("deliveries")
    .select("date")
    .in("date", valid)
    .neq("status", "취소");
  const skipped = new Set(
    ((existing ?? []) as { date: string }[]).map((r) => r.date)
  );
  const targets = valid.filter((d) => !skipped.has(d));

  if (targets.length > 0) {
    const { error } = await supabaseAdmin!
      .from("blocked_dates")
      .upsert(targets.map((date) => ({ date })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ done: targets.length, skipped: [...skipped] });
}
