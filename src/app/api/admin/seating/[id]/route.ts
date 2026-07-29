import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * 관리자 — 테이블 수정·삭제 (§5.4)
 * DELETE 는 배정된 RSVP 가 있으면 FK(NO ACTION) 로 DB 가 차단 → 409 로 안내.
 * 운영 중 숨김은 PATCH { active: false } 사용.
 */

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = adminGuard(req);
  if (bad) return bad;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    zone?: string | null;
    side?: string | null;
    capacity?: number;
    floor?: string | null;
    locationNote?: string | null;
    sortOrder?: number;
    active?: boolean;
  };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name)
      return NextResponse.json({ error: "테이블명이 필요합니다." }, { status: 400 });
    patch.name = name;
  }
  if (body.zone !== undefined)
    patch.zone = body.zone === null ? null : String(body.zone).trim() || null;
  if (body.side !== undefined)
    patch.side = ["groom", "bride", "common"].includes(String(body.side))
      ? body.side
      : null;
  if (body.capacity !== undefined) {
    const c = Math.trunc(Number(body.capacity));
    if (!Number.isFinite(c) || c < 1 || c > 50)
      return NextResponse.json({ error: "정원은 1~50 입니다." }, { status: 400 });
    patch.capacity = c;
  }
  if (body.floor !== undefined)
    patch.floor = body.floor === null ? null : String(body.floor).trim() || null;
  if (body.locationNote !== undefined)
    patch.location_note =
      body.locationNote === null
        ? null
        : String(body.locationNote).trim() || null;
  if (body.sortOrder !== undefined && Number.isFinite(Number(body.sortOrder)))
    patch.sort_order = Math.trunc(Number(body.sortOrder));
  if (body.active !== undefined) patch.active = body.active === true;

  const { data, error } = await supabaseAdmin!
    .from("seating_tables")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ table: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = adminGuard(req);
  if (bad) return bad;
  const { id } = await params;

  const { error } = await supabaseAdmin!
    .from("seating_tables")
    .delete()
    .eq("id", id);
  if (error) {
    // 23503: FK 위반 — 배정된 RSVP 존재 (§12 테이블 삭제 차단)
    if (error.code === "23503")
      return NextResponse.json(
        { error: "배정된 하객이 있는 테이블은 삭제할 수 없어요. 대신 '운영에서 숨기기'를 사용하세요." },
        { status: 409 }
      );
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ done: true });
}
