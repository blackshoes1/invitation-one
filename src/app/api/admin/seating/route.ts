import { NextResponse } from "next/server";
import { checkAdmin } from "@/lib/adminAuth";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";

/**
 * 관리자 — 테이블 관리 (§5)
 * GET  : 테이블 목록 + 배정/도착 집계 (§5.3)
 * POST : 테이블 생성
 */

function guard(req: Request) {
  if (!checkAdmin(req))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json({ error: "설정이 필요합니다." }, { status: 503 });
  return null;
}

export async function GET(req: Request) {
  const bad = guard(req);
  if (bad) return bad;

  const [tblRes, rsvpRes, ckRes] = await Promise.all([
    supabaseAdmin!
      .from("seating_tables")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabaseAdmin!
      .from("rsvp")
      .select("id, name, side, attending, companion_count, table_id")
      .eq("attending", true)
      .not("table_id", "is", null),
    supabaseAdmin!
      .from("checkins")
      .select("rsvp_id, actual_party_size")
      .eq("status", "active")
      .not("rsvp_id", "is", null),
  ]);
  const err = tblRes.error ?? rsvpRes.error ?? ckRes.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const assigned = rsvpRes.data ?? [];
  const arrivedByRsvp = new Map(
    (ckRes.data ?? []).map((c) => [c.rsvp_id as string, c.actual_party_size ?? 0])
  );

  const tables = (tblRes.data ?? []).map((t) => {
    const teams = assigned.filter((r) => r.table_id === t.id);
    const assignedPeople = teams.reduce((s, r) => s + 1 + r.companion_count, 0);
    const arrivedPeople = teams.reduce(
      (s, r) => s + (arrivedByRsvp.get(r.id) ?? 0),
      0
    );
    return {
      ...t,
      assignedTeams: teams.map((r) => ({
        rsvpId: r.id,
        name: r.name,
        side: r.side,
        expectedPartySize: 1 + r.companion_count,
        arrived: arrivedByRsvp.has(r.id),
      })),
      assignedPeople,
      arrivedPeople,
      // 정원 초과는 허용하되 경고 (§5.3)
      overCapacity: assignedPeople > t.capacity,
    };
  });

  return NextResponse.json({ tables });
}

export async function POST(req: Request) {
  const bad = guard(req);
  if (bad) return bad;

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    zone?: string;
    side?: string;
    capacity?: number;
    floor?: string;
    locationNote?: string;
    sortOrder?: number;
  };
  const name = String(body.name ?? "").trim();
  if (!name)
    return NextResponse.json({ error: "테이블명이 필요합니다." }, { status: 400 });
  const capacity = Math.trunc(Number(body.capacity));
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > 50)
    return NextResponse.json({ error: "정원은 1~50 입니다." }, { status: 400 });

  const { data, error } = await supabaseAdmin!
    .from("seating_tables")
    .insert({
      name,
      zone: String(body.zone ?? "").trim() || null,
      side: ["groom", "bride", "common"].includes(String(body.side))
        ? body.side
        : null,
      capacity,
      floor: String(body.floor ?? "").trim() || null,
      location_note: String(body.locationNote ?? "").trim() || null,
      sort_order: Number.isFinite(Number(body.sortOrder))
        ? Math.trunc(Number(body.sortOrder))
        : 0,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ table: data });
}
