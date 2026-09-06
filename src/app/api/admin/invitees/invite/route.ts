import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateManageToken, hashManageToken } from "@/lib/manageToken";
import { personalInviteUrl } from "@/lib/invite";
import { siteOrigin } from "@/lib/siteUrl";

/**
 * 그룹 없는 개별 초대 링크 발급 — body `{ member_id }` 또는 `{ all: true }`
 *
 * 그룹판(`/api/admin/groups/[id]/members/invite`)과 토큰 규칙은 같다: 128-bit
 * 무작위, DB 에는 sha256 해시만 저장, 재발급하면 이전 링크는 무효.
 * 다른 점은 **주소가 하나뿐**이라는 것 — 그룹이 없으니 그룹 페이지 링크가 없다.
 *
 * 응답: `{ links: [{ id, name, personalUrl }] }`
 */
export async function POST(req: Request) {
  const bad = await adminGuard(req);
  if (bad) return bad;

  const body = (await req.json().catch(() => ({}))) as {
    member_id?: string;
    all?: boolean;
  };

  let q = supabaseAdmin!
    .from("group_members")
    .select("id, name")
    .is("group_id", null);
  if (!body.all) {
    if (!body.member_id)
      return NextResponse.json({ error: "member_id 가 필요합니다." }, { status: 400 });
    q = q.eq("id", body.member_id);
  }
  const { data: members, error } = await q.order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!members?.length) return NextResponse.json({ error: "not found" }, { status: 404 });

  const origin = siteOrigin(req);
  const now = new Date().toISOString();
  const links: { id: string; name: string; personalUrl: string }[] = [];
  for (const m of members) {
    const token = generateManageToken();
    const { error: upErr } = await supabaseAdmin!
      .from("group_members")
      .update({ invite_token_hash: hashManageToken(token), invited_at: now })
      .eq("id", m.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    links.push({ id: m.id, name: m.name, personalUrl: personalInviteUrl(origin, token) });
  }
  return NextResponse.json({ links });
}
