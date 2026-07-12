import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

/** 마음 배송 목록 — participants(type=마음배송) 기준 (v7 참여 시스템) */
export async function GET(req: Request) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json(
      { error: "Supabase service role key 가 설정되지 않았습니다." },
      { status: 503 }
    );

  const { data, error } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("type", "마음배송")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

/** 공개 답글 저장/삭제 (LC-3) — 신랑·신부가 방명록 메시지에 남기는 답글 */
export async function PATCH(req: Request) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json(
      { error: "Supabase service role key 가 설정되지 않았습니다." },
      { status: 503 }
    );

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    reply?: string | null;
  } | null;
  if (!body?.id)
    return NextResponse.json({ error: "id_required" }, { status: 400 });

  const trimmed = (body.reply ?? "").trim();
  const hasReply = trimmed.length > 0;

  const { data, error } = await supabaseAdmin
    .from("participants")
    .update({
      reply: hasReply ? trimmed : null,
      replied_at: hasReply ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .select("id, reply, replied_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, participant: data });
}
