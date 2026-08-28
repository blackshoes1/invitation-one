import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import {
  json,
  parseName,
  parsePhone,
  parseManageTokenParam,
  resolveInvite,
  linkGroupMember,
  firstRow,
  rpcErrorCode,
} from "@/lib/deliveryApi";

/**
 * 그룹 제안 일정 수락 (공개) — P1-1: 브라우저 accept_group_offer_v2 직접 호출 대체.
 * 초대 토큰(P1-2): 요청 slug 가 토큰의 그룹과 다르면 403 invite_group_mismatch.
 */
export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return json({ error: "server_not_configured" }, 503);

  if (!(await rateLimitAllow(`group:accept:${clientIp(req)}`, 30, 600)))
    return json({ error: "rate_limited" }, 429);

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return json({ error: "bad_request" }, 400);

  const slug = typeof b.slug === "string" ? b.slug.trim().slice(0, 80) : "";
  if (!slug) return json({ error: "bad_request" }, 400);

  const inviteToken =
    typeof b.inviteToken === "string" && b.inviteToken ? b.inviteToken : null;
  const invite = inviteToken ? await resolveInvite(inviteToken) : null;
  if (inviteToken && !invite) return json({ error: "invite_invalid" }, 401);
  if (invite && invite.groupSlug !== slug)
    return json({ error: "invite_group_mismatch" }, 403);

  const name = parseName(b.name) ?? (invite ? parseName(invite.name) : null);
  if (!name) return json({ error: "name_invalid" }, 400);
  const phone = invite ? null : parsePhone(b.phone);
  if (!invite && !phone) return json({ error: "phone_invalid" }, 400);

  const { data, error } = await supabaseAdmin.rpc("accept_group_offer_v2", {
    p_slug: slug,
    p_name: name,
    p_phone: phone ?? "",
    p_convert_token: parseManageTokenParam(b.convertToken),
    p_invite_token: invite ? inviteToken : null,
  });
  if (error) {
    const e = rpcErrorCode(error.message);
    if (e.code === "server_error")
      console.error("[api/delivery/group/accept] accept_group_offer_v2:", error.message);
    return json({ error: e.code }, e.status);
  }

  const row = firstRow<{
    result: string;
    participant_id: string | null;
    delivery_id: string | null;
    member_count: number | null;
    manage_token: string | null;
  }>(data);
  if (!row) return json({ error: "server_error" }, 500);
  if (invite && row.participant_id)
    await linkGroupMember(row.participant_id, invite.memberId);

  return json({
    result: row.result,
    member_count: row.member_count,
    manage_token: row.manage_token,
  });
}
