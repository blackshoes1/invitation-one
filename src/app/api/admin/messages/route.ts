import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** 마음 배송 목록 — participants(type=마음배송) 기준 (v7 참여 시스템) */
export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { data, error } = await supabaseAdmin!
    .from("participants")
    .select("*")
    .eq("type", "마음배송")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

/** 공개 답글 저장/삭제 (LC-3) + 공개 설정(익명/실명·비공개) 전환 */
export async function PATCH(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const body = (await req.json().catch(() => null)) as {
    id?: string;
    reply?: string | null;
    /** 공개 설정 변경 (관리자가 익명↔실명·비공개 전환) */
    display_mode?: "anon" | "initial" | "name";
    is_private?: boolean;
  } | null;
  if (!body?.id)
    return NextResponse.json({ error: "id_required" }, { status: 400 });

  if (body.display_mode !== undefined || body.is_private !== undefined) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.display_mode !== undefined) {
      if (!["anon", "initial", "name"].includes(body.display_mode))
        return NextResponse.json({ error: "display_mode_invalid" }, { status: 400 });
      patch.display_mode = body.display_mode;
    }
    if (body.is_private !== undefined) patch.is_private = Boolean(body.is_private);
    const { data, error } = await supabaseAdmin!
      .from("participants")
      .update(patch)
      .eq("id", body.id)
      .select("id, display_mode, is_private")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, participant: data });
  }

  const trimmed = (body.reply ?? "").trim();
  const hasReply = trimmed.length > 0;

  const { data, error } = await supabaseAdmin!
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
