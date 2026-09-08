import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { parseOffer } from "@/lib/groupOffer";
import { tallyParticipants, type ParticipantTally } from "@/lib/groupCounts";

function makeSlug() {
  return Math.random().toString(36).slice(2, 8);
}

export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  // 그룹 목록 + 집계.
  //
  // ⚠️ 세 가지를 절대 섞지 않는다 (docs/COUNTING.md):
  //   roster_count  명단 인원      — group_members 행 수. 사람 수다.
  //   order_count   직접배달 신청  — 취소되지 않은 직접배달 participants **기록 수**
  //   heart_count   마음배송       — 마음배송 participants **기록 수**
  // order_count + heart_count 는 기록 수의 합이지 고유 인원도, 식수도 아니다 —
  // 같은 사람이 마음배송을 보낸 뒤 직접배달을 신청하면 둘 다 잡힌다.
  // 이름만으로 중복 제거하지 않는다 (동명이인을 한 사람으로 합치게 된다).
  //
  // 숨김(hidden)은 표시용 속성이므로 취소와 같이 취급하지 않는다 — 숨겨도 그 사람은
  // 여전히 온다. 완료 주문은 기존 기준대로 포함한다.
  const [gRes, pRes, mRes] = await Promise.all([
    supabaseAdmin!
      .from("groups")
      .select("*")
      .order("created_at", { ascending: false }),
    // participants → deliveries 는 FK 가 둘(delivery_id · pending_delivery_id)이라
    // 관계를 명시해야 한다. 생략하면 PostgREST 가 모호하다고 거절한다.
    supabaseAdmin!
      .from("participants")
      .select("group_id, type, delivery:deliveries!delivery_id(status)"),
    supabaseAdmin!.from("group_members").select("group_id"),
  ]);
  if (gRes.error)
    return NextResponse.json({ error: gRes.error.message }, { status: 500 });
  // 집계 조회가 실패하면 0명으로 보여주지 않는다 — "아무도 신청 안 함"과
  // "못 세었음"은 관리자에게 완전히 다른 뜻이다.
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

  // delivery 임베드는 다대일(FK delivery_id)이라 런타임엔 객체 — TS 추론만 배열이라 unknown 경유 캐스팅
  const { byGroup, totals } = tallyParticipants(
    (pRes.data ?? []) as unknown as ParticipantTally[]
  );

  const groups = (gRes.data ?? []).map((g: { id: string }) => {
    const t = byGroup.get(g.id) ?? { orders: 0, hearts: 0 };
    return {
      ...g,
      order_count: t.orders,
      heart_count: t.hearts,
      // 구 필드 — 기존 소비처 호환. 두 종류의 기록 수 합이다 (고유 인원 아님).
      member_count: t.orders + t.hearts,
      roster_count: roster.get(g.id) ?? 0,
    };
  });
  return NextResponse.json({
    groups,
    // 구 필드 — 기존 소비처 호환 (그룹 미지정 신청도 포함한 전체 기록 수)
    total_members: totals.records,
    totals,
  });
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
