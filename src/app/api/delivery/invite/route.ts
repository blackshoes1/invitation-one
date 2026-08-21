import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { hashManageToken } from "@/lib/manageToken";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import { INVITE_TOKEN_RE, maskPhone } from "@/lib/invite";

/**
 * 개인 초대 링크 해석 — ?i=<토큰> → { name, phoneMasked, groupSlug }
 * 실제 연락처는 내려가지 않는다 (마스킹). 제출 시 RPC 가 토큰으로 채움.
 */
export async function GET(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json({ error: "server_not_configured" }, { status: 503 });
  const t = new URL(req.url).searchParams.get("i") ?? "";
  if (!INVITE_TOKEN_RE.test(t))
    return NextResponse.json({ error: "invalid" }, { status: 401 });
  if (!(await rateLimitAllow(`invite:${clientIp(req)}`, 60, 600)))
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const { data } = await supabaseAdmin
    .from("group_members")
    .select("name, phone, groups!inner(slug)")
    .eq("invite_token_hash", hashManageToken(t))
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "invalid" }, { status: 401 });
  const g = data.groups as unknown as { slug: string } | { slug: string }[];
  const slug = Array.isArray(g) ? g[0]?.slug : g?.slug;
  return NextResponse.json(
    { invite: { name: data.name, phoneMasked: maskPhone(data.phone), groupSlug: slug } },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
