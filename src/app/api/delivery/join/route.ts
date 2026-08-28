import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import {
  json,
  parseName,
  parsePhone,
  parseUuid,
  parseManageTokenParam,
  resolveInvite,
  linkGroupMember,
  firstRow,
  rpcErrorCode,
} from "@/lib/deliveryApi";

/**
 * 기존 배송(주문) 합류 (공개) — P1-1: 브라우저 join_delivery_v2 직접 호출 대체.
 * 초대 토큰(P1-2): 대상 주문의 그룹이 토큰의 그룹과 다르면 403.
 */
export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return json({ error: "server_not_configured" }, 503);

  // 같은 모임이 한 Wi-Fi 에서 연달아 합류할 수 있어 여유 있게
  if (!(await rateLimitAllow(`delivery:join:${clientIp(req)}`, 30, 600)))
    return json({ error: "rate_limited" }, 429);

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return json({ error: "bad_request" }, 400);

  const deliveryId = parseUuid(b.deliveryId);
  if (!deliveryId) return json({ error: "bad_request" }, 400);

  const inviteToken =
    typeof b.inviteToken === "string" && b.inviteToken ? b.inviteToken : null;
  const invite = inviteToken ? await resolveInvite(inviteToken) : null;
  if (inviteToken && !invite) return json({ error: "invite_invalid" }, 401);

  // 초대 결속: 합류하려는 주문의 그룹 == 토큰의 그룹 (서버 검증 — 클라이언트 불신)
  if (invite) {
    const { data: d } = await supabaseAdmin
      .from("deliveries")
      .select("group_id")
      .eq("id", deliveryId)
      .maybeSingle();
    if (!d) return json({ error: "not_found" }, 404);
    if (d.group_id !== invite.groupId)
      return json({ error: "invite_group_mismatch" }, 403);
  }

  const name = parseName(b.name) ?? (invite ? parseName(invite.name) : null);
  if (!name) return json({ error: "name_invalid" }, 400);
  const phone = invite ? null : parsePhone(b.phone);
  if (!invite && !phone) return json({ error: "phone_invalid" }, 400);

  const { data, error } = await supabaseAdmin.rpc("join_delivery_v2", {
    p_delivery: deliveryId,
    p_name: name,
    p_phone: phone ?? "",
    p_convert_token: parseManageTokenParam(b.convertToken),
    p_invite_token: invite ? inviteToken : null,
  });
  if (error) {
    const e = rpcErrorCode(error.message);
    if (e.code === "server_error")
      console.error("[api/delivery/join] join_delivery_v2:", error.message);
    return json({ error: e.code }, e.status);
  }

  const row = firstRow<{
    result: string;
    participant_id: string | null;
    manage_token: string | null;
  }>(data);
  if (!row) return json({ error: "server_error" }, 500);
  if (invite && row.participant_id)
    await linkGroupMember(row.participant_id, invite.memberId);

  return json({ result: row.result, manage_token: row.manage_token });
}
