import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseOffer } from "@/lib/groupOffer";

/**
 * 그룹 삭제.
 *
 * 조심해야 하는 이유 — groups 를 참조하는 FK 세 개가 서로 다르게 동작한다:
 *   deliveries.group_id      ON DELETE SET NULL  → 그 그룹 주문이 **개인 주문이 된다**
 *   group_members.group_id   ON DELETE CASCADE   → 명단이 함께 사라진다 (초대 링크 무효)
 *   participants.group_id    ON DELETE SET NULL  → 참여자의 그룹 연결이 끊긴다
 *
 * 즉 살아 있는 주문이 있는 그룹을 지우면 그 주문들이 **조용히** 개인 주문으로
 * 바뀌고, 되돌릴 방법이 없다(어느 그룹이었는지가 어디에도 안 남는다).
 * 그래서 취소되지 않은 주문이 하나라도 있으면 막고, 무엇이 막는지 알려준다.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id } = await params;

  // 없는 id 로 조용히 성공하지 않게 존재부터 확인
  const { data: g } = await supabaseAdmin!
    .from("groups")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: "그룹을 찾을 수 없습니다." }, { status: 404 });

  const { data: live, error: liveErr } = await supabaseAdmin!
    .from("deliveries")
    .select("id, date, time_slot, status")
    .eq("group_id", id)
    .neq("status", "취소")
    .order("date", { ascending: true });
  if (liveErr)
    return NextResponse.json({ error: liveErr.message }, { status: 500 });
  if (live && live.length > 0) {
    return NextResponse.json(
      {
        error:
          `아직 살아 있는 주문이 ${live.length}건 있어 그룹을 지울 수 없습니다. ` +
          `지우면 이 주문들이 그룹 없는 개인 주문으로 바뀌고 되돌릴 수 없어요. ` +
          `주문 탭에서 먼저 취소하거나 완료 처리해주세요.`,
        blocking_orders: live.map((d) => ({
          id: d.id,
          date: d.date,
          time_slot: d.time_slot,
          status: d.status,
        })),
      },
      { status: 409 }
    );
  }

  // 삭제 후에는 셀 수 없으므로 먼저 집계해 둔다 (무엇이 정리됐는지 알려주기 위해)
  const [rosterRes, canceledRes, heartRes] = await Promise.all([
    supabaseAdmin!
      .from("group_members")
      .select("id", { count: "exact", head: true })
      .eq("group_id", id),
    supabaseAdmin!
      .from("deliveries")
      .select("id", { count: "exact", head: true })
      .eq("group_id", id),
    supabaseAdmin!
      .from("participants")
      .select("id", { count: "exact", head: true })
      .eq("group_id", id)
      .eq("type", "마음배송"),
  ]);

  const { error } = await supabaseAdmin!.from("groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    name: g.name,
    removed: {
      roster: rosterRes.count ?? 0,
      canceled_orders: canceledRes.count ?? 0,
      hearts: heartRes.count ?? 0,
    },
  });
}

/** 그룹명 수정 + 제안 일정 설정/수정/해제 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = await adminGuard(req);
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
