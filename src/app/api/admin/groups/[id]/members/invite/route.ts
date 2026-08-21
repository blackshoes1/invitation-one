import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateManageToken, hashManageToken } from "@/lib/manageToken";
import { inviteUrl } from "@/lib/invite";
import { siteOrigin } from "@/lib/siteUrl";

/**
 * 개인 초대 링크 발급 — body { member_id } 또는 { all: true }
 * 토큰은 128-bit 무작위, DB 에는 sha256 해시만 저장(재복사 = 재발급, 이전 링크 무효).
 * 응답: { links: [{ id, name, url }] }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const bad = await adminGuard(req);
  if (bad) return bad;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { member_id?: string; all?: boolean };

  const { data: g } = await supabaseAdmin!
    .from("groups")
    .select("slug")
    .eq("id", id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: "group not found" }, { status: 404 });

  let q = supabaseAdmin!.from("group_members").select("id, name").eq("group_id", id);
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
  const links: { id: string; name: string; url: string }[] = [];
  for (const m of members) {
    const token = generateManageToken();
    const { error: upErr } = await supabaseAdmin!
      .from("group_members")
      .update({ invite_token_hash: hashManageToken(token), invited_at: now })
      .eq("id", m.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    links.push({ id: m.id, name: m.name, url: inviteUrl(origin, g.slug, token) });
  }
  return NextResponse.json({ links });
}
