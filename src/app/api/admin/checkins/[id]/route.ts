import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

/**
 * 관리자 — 체크인 수정·취소 (§6, §9-11)
 * PATCH  : 실제 인원·식사 인원·메모·상태(merged 포함) 수정
 * DELETE : 취소 — 삭제하지 않고 status='canceled' 로 보존
 */

function guard(req: Request) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json({ error: "설정이 필요합니다." }, { status: 503 });
  return null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = guard(req);
  if (bad) return bad;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    actualPartySize?: number;
    mealCount?: number | null;
    memo?: string | null;
    status?: string;
  };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.actualPartySize !== undefined) {
    const n = Math.trunc(Number(body.actualPartySize));
    if (!Number.isFinite(n) || n < 1 || n > 20)
      return NextResponse.json({ error: "invalid_party_size" }, { status: 400 });
    patch.actual_party_size = n;
    patch.party_size = n; // 레거시 컬럼 동기화
  }
  if (body.mealCount !== undefined) {
    if (body.mealCount === null) patch.meal_count = null;
    else {
      const m = Math.trunc(Number(body.mealCount));
      if (!Number.isFinite(m) || m < 0)
        return NextResponse.json({ error: "invalid_meal" }, { status: 400 });
      patch.meal_count = m;
    }
  }
  if (body.memo !== undefined)
    patch.admin_memo =
      body.memo === null ? null : String(body.memo).trim().slice(0, 500) || null;
  if (body.status !== undefined) {
    if (!["active", "canceled", "merged"].includes(body.status))
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    patch.status = body.status;
    patch.canceled_at =
      body.status === "canceled" ? new Date().toISOString() : null;
  }

  const { data, error } = await supabaseAdmin!
    .from("checkins")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    // 재활성화가 활성 1건 제약과 충돌하는 경우 등
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ checkin: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = guard(req);
  if (bad) return bad;
  const { id } = await params;

  // 기록 보존 원칙(§9-11): 삭제 대신 취소 상태로 전환
  const { data, error } = await supabaseAdmin!
    .from("checkins")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ checkin: data });
}
