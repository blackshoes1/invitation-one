import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import { parsePhone } from "@/lib/deliveryApi";
import type { RosterName } from "@/lib/roster";

/**
 * 그룹 명단의 **이름만** — `GET /api/delivery/group/roster?slug=<슬러그>`
 *
 * 왜 필요한가: 단톡방에 뿌리는 그룹 링크(`/delivery/group/<슬러그>`)는 **여러 명이
 * 같이 쓰는 한 개의 주소**라 서버가 "지금 누가 눌렀는지"를 알 수 없다. 개인 초대
 * 링크(`?i=<토큰>`)만이 사람을 특정한다. 그룹 링크로 들어온 하객이 이름을 매번
 * 손으로 치는 걸 줄이려고, **고를 수 있게** 이름 목록만 내려준다.
 *
 * ⚠️ 내려주는 것은 **이름과 `hasPhone` 뿐이다.** 연락처는 마스킹본조차 내려가지
 *    않는다 — 번호는 제출 시점에 서버가 붙인다(`rosterPhone`). 그래서 그룹 링크를
 *    가졌다는 것만으로는 남의 번호를 알아낼 수 없다. member_id·초대 여부도 안 준다.
 *
 * `hasPhone` 은 "이 이름을 고르면 번호를 서버가 채워줄 수 있는가" 하나만 뜻한다.
 * 동명이인이면 누구 번호인지 고를 수 없으므로 **false** 다 (아무거나 붙이면 엉뚱한
 * 사람에게 배송 연락이 간다). `rosterPhone` 과 같은 규칙이어야 화면과 제출이
 * 어긋나지 않는다.
 *
 * 그래서 `group_members` 는 anon 이 못 읽는다(RLS·RPC 권한 회수, 20260731000200).
 * 여기서만 service_role 로 읽고 **이름만** 걸러 내보낸다.
 */
export async function GET(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json({ error: "server_not_configured" }, { status: 503 });

  const slug = (new URL(req.url).searchParams.get("slug") ?? "").trim().slice(0, 80);
  if (!slug) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  if (!(await rateLimitAllow(`roster:${clientIp(req)}`, 60, 600)))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { data: group } = await supabaseAdmin
    .from("groups")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  // 없는 그룹과 빈 명단을 굳이 구분해 알려주지 않는다 — 슬러그를 넣어보며
  // 그룹의 존재 여부를 캐는 데 쓰이지 않게.
  if (!group) return names([]);

  // phone 은 **여기서만** 본다 — 응답에는 있음/없음(boolean)만 나간다.
  const { data, error } = await supabaseAdmin
    .from("group_members")
    .select("name, phone")
    .eq("group_id", group.id)
    .limit(300);
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 500 });

  // 동명이인은 한 줄로 합치고 hasPhone 을 끈다 — 같은 글자를 두 번 보여줘 봐야
  // 고를 수 없고, 번호는 누구 것인지 정할 수 없다 (rosterPhone 과 같은 규칙).
  const byName = new Map<string, { count: number; phone: string | null }>();
  for (const m of data ?? []) {
    const n = (m.name ?? "").trim();
    if (!n) continue;
    const prev = byName.get(n);
    byName.set(n, {
      count: (prev?.count ?? 0) + 1,
      phone: prev ? prev.phone : parsePhone(m.phone),
    });
  }
  const list: RosterName[] = [...byName.entries()]
    .map(([name, v]) => ({ name, hasPhone: v.count === 1 && Boolean(v.phone) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return names(list);
}

function names(list: RosterName[]) {
  return NextResponse.json(
    { names: list },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
