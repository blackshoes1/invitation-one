import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseOffer } from "@/lib/groupOffer";

function makeSlug() {
  return Math.random().toString(36).slice(2, 8);
}

export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  // 그룹 목록 + 인원 집계
  //  - roster_count: 관리자가 등록한 명단(group_members) 인원 — 카드에 표시
  //  - member_count: 실제 참여(주문)한 participants 인원 (취소 직접배달 제외) — 요약·식수용
  const [gRes, pRes, mRes] = await Promise.all([
    supabaseAdmin!
      .from("groups")
      .select("*")
      .order("created_at", { ascending: false }),
    supabaseAdmin!
      .from("participants")
      .select("group_id, type, delivery:deliveries!delivery_id(status)"),
    supabaseAdmin!.from("group_members").select("group_id"),
  ]);
  if (gRes.error)
    return NextResponse.json({ error: gRes.error.message }, { status: 500 });
  if (pRes.error)
    return NextResponse.json({ error: pRes.error.message }, { status: 500 });
  if (mRes.error)
    return NextResponse.json({ error: mRes.error.message }, { status: 500 });

  // 명단(roster) 인원 집계
  const roster = new Map<string, number>();
  for (const m of (mRes.data ?? []) as { group_id: string | null }[]) {
    if (m.group_id)
      roster.set(m.group_id, (roster.get(m.group_id) ?? 0) + 1);
  }

  const counts = new Map<string, number>();
  let total = 0;
  // delivery 임베드는 다대일(FK delivery_id)이라 런타임엔 객체 — TS 추론만 배열이라 unknown 경유 캐스팅
  for (const p of (pRes.data ?? []) as unknown as {
    group_id: string | null;
    type: string;
    delivery: { status: string } | null;
  }[]) {
    if (p.type === "직접배달" && p.delivery?.status === "취소") continue;
    total++;
    if (p.group_id)
      counts.set(p.group_id, (counts.get(p.group_id) ?? 0) + 1);
  }

  const groups = (gRes.data ?? []).map((g: { id: string }) => ({
    ...g,
    member_count: counts.get(g.id) ?? 0,
    roster_count: roster.get(g.id) ?? 0,
  }));
  return NextResponse.json({ groups, total_members: total });
}

export async function POST(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const body = (await req.json()) as {
    name?: string;
    offer_date?: string | null;
    offer_time?: string | null;
    offer_location?: string | null;
  };
  const { name } = body;
  if (!name?.trim())
    return NextResponse.json({ error: "그룹명을 입력해주세요." }, { status: 400 });

  const offer = parseOffer(body);
  if ("error" in offer)
    return NextResponse.json({ error: offer.error }, { status: 400 });

  // slug 충돌 시 최대 3회 재시도
  for (let i = 0; i < 3; i++) {
    const slug = makeSlug();
    const { data, error } = await supabaseAdmin!
      .from("groups")
      .insert({ name: name.trim(), slug, ...offer.fields })
      .select()
      .single();
    if (!error) return NextResponse.json({ group: data });
    if (error.code !== "23505")
      return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ error: "slug 생성 실패, 다시 시도해주세요." }, { status: 500 });
}
