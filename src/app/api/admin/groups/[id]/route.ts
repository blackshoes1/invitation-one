import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { parseOffer } from "@/lib/groupOffer";

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

/** 그룹명 수정 + 제안 일정 설정/수정/해제 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = guard(req);
  if (bad) return bad;
  const { id } = await params;

  const body = (await req.json()) as {
    name?: string;
    /** true 를 보내면 제안 일정 필드(offer_*)를 반영 (전부 비우면 제안 해제) */
    set_offer?: boolean;
    offer_date?: string | null;
    offer_time?: string | null;
    offer_location?: string | null;
  };

  const patch: Record<string, string | null> = {};

  if (body.name !== undefined) {
    if (!body.name?.trim())
      return NextResponse.json({ error: "그룹명을 입력해주세요." }, { status: 400 });
    patch.name = body.name.trim();
  }

  if (body.set_offer) {
    const offer = parseOffer(body);
    if ("error" in offer)
      return NextResponse.json({ error: offer.error }, { status: 400 });
    Object.assign(patch, offer.fields);
    // 제안을 바꾸면 다음 승낙부터 새 주문이 생기도록 연결 해제
    // (이미 생성된 기존 주문은 일반 주문으로 남음 — 필요 시 주문 탭에서 취소)
    patch.offer_delivery_id = null;
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "변경할 내용이 없습니다." }, { status: 400 });

  const { data, error } = await supabaseAdmin!
    .from("groups")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data });
}
