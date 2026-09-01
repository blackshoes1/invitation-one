import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 관리자 전용 축하 피드(방명록) — 실명 확인용.
 *
 * 공개 RPC get_celebrations 는 마음배송을 익명 별명/한 글자 가림으로 마스킹하는데,
 * 신랑·신부가 청첩장 방명록에서 "누가 남긴 글인지" 확인할 수 없어 불편했다.
 * 이 라우트는 관리자 세션에서만(adminGuard) 참여자 id → 실명 매핑을 돌려준다.
 * 공개 피드 자체(마스킹)는 그대로 두고, 청첩장 화면이 관리자일 때만 덧입힌다.
 */
export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { data, error } = await supabaseAdmin!
    .from("participants")
    .select("id, name, phone, display_mode, is_private, region, attendance")
    .eq("type", "마음배송")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const realNames: Record<string, { name: string; masked: boolean }> = {};
  for (const p of data ?? []) {
    realNames[p.id as string] = {
      name: p.name as string,
      // 공개 화면에서 실명이 아닌 형태로 보이는 건(익명·한글자가림) 표시 대상
      masked: p.display_mode !== "name",
    };
  }
  return NextResponse.json(
    { realNames },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
