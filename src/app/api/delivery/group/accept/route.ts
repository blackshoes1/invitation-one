import { after } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { drainNotifications } from "@/lib/notifyOutbox";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import {
  json,
  parseName,
  parseManageTokenParam,
  resolvePhone,
  rosterPhone,
  loadGroupBySlug,
  resolveInvite,
  firstRow,
  rpcErrorCode,
} from "@/lib/deliveryApi";
import { inviteMatchesGroupSlug } from "@/lib/orderKind";

/**
 * 그룹 제안 일정 수락 (공개) — P1-1: 브라우저 accept_group_offer_v2 직접 호출 대체.
 *
 * 이 경로는 정의상 그룹 주문이라 종류를 판정할 게 없다. 남는 규칙은 초대 결속
 * 하나뿐이고, 그것도 create·join 과 같은 곳에서 가져다 쓴다 (orderKind).
 * 초대 토큰(P1-2)은 신원만 담당한다 — 연락처를 직접 입력해도 토큰은 그대로 와서
 * 참여자가 명단(group_member)과 연결된다.
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

  if (!inviteMatchesGroupSlug(invite, slug))
    return json({ error: "invite_group_mismatch" }, 403);

  const name = parseName(b.name) ?? (invite ? parseName(invite.name) : null);
  if (!name) return json({ error: "name_invalid" }, 400);
  // 연락처 — 직접 입력했으면 그 번호, 아니면 RPC 가 초대 토큰으로 채움
  // 명단에서 고른 이름이면 그 이름의 번호를 여기서 붙인다
  const picked =
    b.rosterName === true && !invite
      ? await rosterPhone((await loadGroupBySlug(slug))?.id ?? null, name)
      : null;
  const ph = resolvePhone(b.phone, Boolean(invite) || Boolean(picked));
  if (!ph.ok) return json({ error: "phone_invalid" }, 400);
  const phone = ph.phone ?? picked;

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

  // P1-4: 응답 후 아웃박스 드레인 (신규 + 재시도 도래분)
  // 에러를 삼키지 않는다 — 여기서 조용히 죽으면 알림이 왜 안 갔는지 알 길이 없다
  after(() =>
    drainNotifications(3).catch((e) =>
      console.error("[outbox] drain failed (after):", e)
    )
  );

  return json({
    result: row.result,
    member_count: row.member_count,
    manage_token: row.manage_token,
  });
}
