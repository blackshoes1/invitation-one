import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { insertCheckin, isUuid } from "@/lib/checkinServer";

/**
 * 관리자 — 현장 운영 (docs/CHECKIN_SEATING_SPEC.md §6, §8.5, §14)
 * GET  : RSVP 목록(체크인·좌석 병합) + 체크인 목록 + 확정 산식 통계
 * POST : 수동 체크인 (RSVP 연결 source='admin' / 현장 등록 source='walk_in')
 *        관리자 경로는 운영 시간 제한을 적용하지 않는다 (§10 비상 모드).
 */

export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const [rsvpRes, ckRes, tblRes] = await Promise.all([
    supabaseAdmin!
      .from("rsvp")
      .select(
        "id, name, phone, side, attending, companion_count, children, kids_meal, eating, memo, table_id, checkin_token_active, qr_issued_at, created_at, updated_at"
      )
      .order("created_at", { ascending: true }),
    supabaseAdmin!
      .from("checkins")
      .select(
        "id, rsvp_id, name, side, expected_party_size, actual_party_size, meal_count, source, status, checked_in_by, admin_memo, created_at, canceled_at"
      )
      .order("created_at", { ascending: false }),
    supabaseAdmin!
      .from("seating_tables")
      .select("id, name, zone, side, capacity, floor, location_note, sort_order, active")
      .order("sort_order", { ascending: true }),
  ]);
  const err = rsvpRes.error ?? ckRes.error ?? tblRes.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const rsvps = rsvpRes.data ?? [];
  const checkins = ckRes.data ?? [];
  const active = checkins.filter((c) => c.status === "active");
  const activeByRsvp = new Map(
    active.filter((c) => c.rsvp_id).map((c) => [c.rsvp_id as string, c])
  );

  // §14 확정 산식
  const attending = rsvps.filter((r) => r.attending);
  const expectedOf = (r: { companion_count: number }) => 1 + r.companion_count;
  const expectedTeams = attending.length;
  const expectedPeople = attending.reduce((s, r) => s + expectedOf(r), 0);
  const arrivedTeams = active.filter((c) => c.rsvp_id).length;
  const arrivedPeople = active.reduce(
    (s, c) => s + (c.actual_party_size ?? 0),
    0
  );
  const rsvpLinked = active.filter((c) => c.rsvp_id);
  const partyDiff = rsvpLinked.reduce(
    (s, c) => s + ((c.actual_party_size ?? 0) - (c.expected_party_size ?? 0)),
    0
  );
  const walkInPeople = active
    .filter((c) => !c.rsvp_id && (c.source === "walk_in" || c.source === "common_qr"))
    .reduce((s, c) => s + (c.actual_party_size ?? 0), 0);
  // legacy 각주(§14): rsvp 미연결 legacy 는 도착 합계에만 포함 — 별도 표기
  const legacyPeople = active
    .filter((c) => !c.rsvp_id && c.source === "legacy")
    .reduce((s, c) => s + (c.actual_party_size ?? 0), 0);
  const sidePeople = (side: string) =>
    active
      .filter((c) => c.side === side)
      .reduce((s, c) => s + (c.actual_party_size ?? 0), 0);
  const mealPlanned = attending
    .filter((r) => r.eating === "yes")
    .reduce((s, r) => s + expectedOf(r), 0);
  const mealUndecided = attending
    .filter((r) => r.eating === "undecided")
    .reduce((s, r) => s + expectedOf(r), 0);
  const kidsMealTeams = attending.filter((r) => r.kids_meal).length;
  const mealActual = active.reduce((s, c) => s + (c.meal_count ?? 0), 0);

  // 공용 QR 인쇄·안내용 링크 (행사 키 포함 — 관리자 응답에만 노출)
  const eventKey = process.env.CHECKIN_EVENT_KEY;
  const origin = new URL(req.url).origin;

  return NextResponse.json({
    rsvps: rsvps.map((r) => ({
      ...r,
      expected_party_size: expectedOf(r),
      checkin: activeByRsvp.get(r.id) ?? null,
    })),
    checkins,
    tables: tblRes.data ?? [],
    commonCheckinUrl: eventKey
      ? `${origin}/checkin?event=${encodeURIComponent(eventKey)}`
      : null,
    stats: {
      expectedTeams,
      expectedPeople,
      arrivedTeams,
      arrivedPeople,
      notArrivedTeams: expectedTeams - arrivedTeams,
      partyDiff,
      walkInPeople,
      legacyPeople,
      groomArrived: sidePeople("groom"),
      brideArrived: sidePeople("bride"),
      mealPlanned,
      mealUndecided,
      kidsMealTeams,
      mealActual,
    },
  });
}

export async function POST(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const body = (await req.json().catch(() => ({}))) as {
    rsvpId?: string;
    name?: string;
    side?: string;
    actualPartySize?: number;
    mealCount?: number;
    memo?: string;
  };

  const actual = Math.trunc(Number(body.actualPartySize));
  if (!Number.isFinite(actual) || actual < 1 || actual > 20)
    return NextResponse.json({ error: "invalid_party_size" }, { status: 400 });
  let meal = Math.trunc(Number(body.mealCount));
  if (!Number.isFinite(meal)) meal = actual;
  if (meal < 0 || meal > actual)
    return NextResponse.json({ error: "invalid_party_size" }, { status: 400 });
  const memo = String(body.memo ?? "").trim().slice(0, 500) || null;

  if (body.rsvpId) {
    // RSVP 연결 수동 체크인
    if (!isUuid(body.rsvpId))
      return NextResponse.json({ error: "bad_request" }, { status: 400 });
    const { data: rsvp } = await supabaseAdmin!
      .from("rsvp")
      .select("id, name, side, attending, companion_count")
      .eq("id", body.rsvpId)
      .maybeSingle();
    if (!rsvp)
      return NextResponse.json({ error: "not_found" }, { status: 404 });

    const { result, checkin } = await insertCheckin(supabaseAdmin!, {
      rsvp_id: rsvp.id,
      name: rsvp.name,
      side: rsvp.side,
      expected_party_size: 1 + rsvp.companion_count,
      actual_party_size: actual,
      meal_count: meal,
      source: "admin",
      checked_in_by: "admin",
      admin_memo: memo,
    });
    return NextResponse.json({ result, checkin });
  }

  // 관리자 현장 하객 등록 — 하객 경로 기준 walk_in (통계 §14 일관성)
  const name = String(body.name ?? "").trim().slice(0, 40);
  if (name.length < 2)
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const side =
    body.side === "groom" || body.side === "bride" ? body.side : null;

  const { result, checkin } = await insertCheckin(supabaseAdmin!, {
    rsvp_id: null,
    name,
    side,
    expected_party_size: null,
    actual_party_size: actual,
    meal_count: meal,
    source: "walk_in",
    checked_in_by: "admin",
    admin_memo: memo,
  });
  return NextResponse.json({ result, checkin });
}
