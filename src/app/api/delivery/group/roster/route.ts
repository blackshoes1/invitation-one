import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";

/**
 * 그룹 명단의 **이름만** — `GET /api/delivery/group/roster?slug=<슬러그>`
 *
 * 왜 필요한가: 단톡방에 뿌리는 그룹 링크(`/delivery/group/<슬러그>`)는 **여러 명이
 * 같이 쓰는 한 개의 주소**라 서버가 "지금 누가 눌렀는지"를 알 수 없다. 개인 초대
 * 링크(`?i=<토큰>`)만이 사람을 특정한다. 그룹 링크로 들어온 하객이 이름을 매번
 * 손으로 치는 걸 줄이려고, **고를 수 있게** 이름 목록만 내려준다.
 *
 * ⚠️ 내려주는 것은 **이름뿐이다.** 연락처(마스킹본 포함)·member_id·초대 여부는
 *    절대 포함하지 않는다. 이름을 골랐다는 사실은 **신원 증명이 아니므로**
 *    (그룹 링크를 가진 누구나 아무 이름이나 고를 수 있다) 이 응답으로는 연락처
 *    자동 입력도, 초대 토큰 발급도 하지 않는다 — 그건 `?i=` 토큰만 할 수 있다.
 *    타이핑을 줄이는 편의일 뿐이라는 선을 넘지 말 것.
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

  const { data, error } = await supabaseAdmin
    .from("group_members")
    .select("name")
    .eq("group_id", group.id)
    .limit(300);
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 500 });

  // 동명이인은 한 줄로 합친다 — 같은 글자를 두 번 보여줘 봐야 고를 수 없고,
  // 골라도 결과(이름 문자열)가 같아 잃는 정보가 없다.
  const list = [
    ...new Set(
      (data ?? []).map((m) => (m.name ?? "").trim()).filter((n) => n.length > 0)
    ),
  ].sort((a, b) => a.localeCompare(b, "ko"));
  return names(list);
}

function names(list: string[]) {
  return NextResponse.json(
    { names: list },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
