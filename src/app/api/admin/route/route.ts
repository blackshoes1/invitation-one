import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { venue } from "@/lib/wedding";

const KAKAO_REST = process.env.KAKAO_REST_API_KEY;

/** 자유 텍스트 주소 → 좌표 (키워드 검색 우선, 실패 시 주소 검색). 못 찾으면 null */
async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  if (!KAKAO_REST || !q.trim()) return null;
  const headers = { Authorization: `KakaoAK ${KAKAO_REST}` };
  for (const kind of ["keyword", "address"] as const) {
    try {
      const u = new URL(`https://dapi.kakao.com/v2/local/search/${kind}.json`);
      u.searchParams.set("query", q);
      u.searchParams.set("size", "1");
      const r = await fetch(u, { headers });
      if (!r.ok) continue;
      const j = (await r.json()) as { documents?: { x: string; y: string }[] };
      const d = j.documents?.[0];
      if (d) return { lat: parseFloat(d.y), lng: parseFloat(d.x) };
    } catch {
      /* 다음 방식 시도 */
    }
  }
  return null;
}

interface Row {
  id: string;
  location: string;
  date: string;
  time_slot: string;
  status: string;
  tracking_stage: string;
  lat: number | null;
  lng: number | null;
  geo_query: string | null;
  participants: { name: string; phone: string | null; is_owner: boolean }[];
}

/** 배송 경로 — 미완료 주문을 날짜별로 묶고, 식장 기준 최근접 순서로 정렬 (AD-1) */
export async function GET(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const { data, error } = await supabaseAdmin!
    .from("deliveries")
    .select(
      "id, location, date, time_slot, status, tracking_stage, lat, lng, geo_query, participants!delivery_id(name, phone, is_owner)"
    )
    .in("status", ["대기중", "확정"])
    .order("date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Row[];

  // 좌표 없음(또는 주소 변경) → 지오코딩 후 캐시
  for (const r of rows) {
    if ((r.lat == null || r.geo_query !== r.location) && r.location) {
      const geo = await geocode(r.location);
      r.lat = geo?.lat ?? null;
      r.lng = geo?.lng ?? null;
      r.geo_query = r.location;
      await supabaseAdmin!
        .from("deliveries")
        .update({ lat: r.lat, lng: r.lng, geo_query: r.location })
        .eq("id", r.id);
    }
  }

  // 날짜별 그룹
  const byDate = new Map<string, Row[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);

  const toStop = (r: Row) => {
    const owner = r.participants?.find((p) => p.is_owner) ?? r.participants?.[0];
    return {
      id: r.id,
      name: owner?.name ?? "—",
      phone: owner?.phone ?? null,
      count: r.participants?.length ?? 0,
      location: r.location,
      time_slot: r.time_slot,
      tracking_stage: r.tracking_stage,
      lat: r.lat,
      lng: r.lng,
    };
  };

  // 식장 기준 최근접 이웃(greedy)으로 방문 순서 결정
  const orderStops = (stops: ReturnType<typeof toStop>[]) => {
    const geo = stops.filter((s) => s.lat != null && s.lng != null);
    const noGeo = stops.filter((s) => s.lat == null || s.lng == null);
    const remaining = [...geo];
    const ordered: typeof geo = [];
    let cur = { lat: venue.lat, lng: venue.lng };
    while (remaining.length) {
      let bi = 0;
      let bd = Infinity;
      remaining.forEach((s, i) => {
        const d = (s.lat! - cur.lat) ** 2 + (s.lng! - cur.lng) ** 2;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      const [nx] = remaining.splice(bi, 1);
      ordered.push(nx);
      cur = { lat: nx.lat!, lng: nx.lng! };
    }
    return [...ordered, ...noGeo].map((s, i) => ({ ...s, order: i + 1 }));
  };

  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rs]) => {
      const stops = orderStops(rs.map(toStop));
      return { date, count: stops.length, stops };
    });

  return NextResponse.json({
    days,
    origin: { lat: venue.lat, lng: venue.lng, name: venue.name },
  });
}
