import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { sendSms } from "@/lib/sms";
import type { WaitingEntry } from "@/lib/supabase";

/**
 * 취소로 빈 자리가 생겼을 때 대기자에게 안내 SMS 발송.
 * body: { id?: string }  — id 있으면 해당 1명, 없으면 대기자 전체.
 */
export async function POST(req: Request) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json(
      { error: "Supabase service role key 가 설정되지 않았습니다." },
      { status: 503 }
    );

  const body = (await req.json().catch(() => ({}))) as { id?: string };

  let query = supabaseAdmin
    .from("waiting_list")
    .select("*")
    .order("created_at", { ascending: true });
  if (body.id) query = query.eq("id", body.id);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const entries = (data ?? []) as WaitingEntry[];
  if (entries.length === 0)
    return NextResponse.json({ error: "대기자가 없습니다." }, { status: 400 });

  const link = `${new URL(req.url).origin}/delivery`;
  const results = await Promise.all(
    entries.map((w) =>
      sendSms(
        w.phone,
        `[청첩장 배달] ${w.name}님, 취소로 빈 자리가 생겼어요! 원하시면 아래에서 다시 신청해주세요 🛵 ${link}`
      ).then((r) => ({ id: w.id, name: w.name, ...r }))
    )
  );

  const sent = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.some((r) => r.skipped);
  return NextResponse.json({ count: entries.length, sent, skipped, results });
}
