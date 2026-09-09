import { after } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { drainNotifications } from "@/lib/notifyOutbox";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import {
  json,
  parseName,
  parseUuid,
  parseManageTokenParam,
  resolvePhone,
  resolveInvite,
  firstRow,
  rpcErrorCode,
} from "@/lib/deliveryApi";
import { inviteMayJoin } from "@/lib/orderKind";

/**
 * 기존 배송(주문) 합류 (공개) — P1-1: 브라우저 join_delivery_v2 직접 호출 대체.
 *
 * 합류는 새 주문을 만들지 않으므로 종류를 판정하지 않는다 — 대상 주문의
 * group_id 가 그대로 그 주문의 종류다. 초대 토큰(P1-2)이 막는 것은 **다른
 * 그룹의 주문으로 넘어가는 것** 하나뿐이다 (`inviteMayJoin`).
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

  // 초대 결속 — 서버 검증, 클라이언트 불신. 판정 규칙은 orderKind 에 모아둔다.
  if (invite) {
    const { data: d } = await supabaseAdmin
      .from("deliveries")
      .select("group_id")
      .eq("id", deliveryId)
      .maybeSingle();
    if (!d) return json({ error: "not_found" }, 404);
    if (!inviteMayJoin(invite, d.group_id))
      return json({ error: "invite_group_mismatch" }, 403);
  }

  const name = parseName(b.name) ?? (invite ? parseName(invite.name) : null);
  if (!name) return json({ error: "name_invalid" }, 400);
  // 연락처 — 직접 입력했으면 그 번호, 아니면 RPC 가 초대 토큰으로 채움
  const ph = resolvePhone(b.phone, Boolean(invite));
  if (!ph.ok) return json({ error: "phone_invalid" }, 400);

  const { data, error } = await supabaseAdmin.rpc("join_delivery_v2", {
    p_delivery: deliveryId,
    p_name: name,
    p_phone: ph.phone ?? "",
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

  // P1-4: 응답 후 아웃박스 드레인 (신규 + 재시도 도래분)
  // 에러를 삼키지 않는다 — 여기서 조용히 죽으면 알림이 왜 안 갔는지 알 길이 없다
  after(() =>
    void drainNotifications(3).catch((e) =>
      console.error("[outbox] drain failed (after):", e)
    )
  );

  return json({ result: row.result, manage_token: row.manage_token });
}
