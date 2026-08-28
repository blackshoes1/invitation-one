import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import {
  json,
  parseName,
  parsePhone,
  parseText,
  parseUuid,
  parseManageTokenParam,
  resolveInvite,
  linkGroupMember,
  firstRow,
  rpcErrorCode,
} from "@/lib/deliveryApi";
import { slotsForDate, TIME_SLOTS } from "@/lib/wedding";
import type { TimeSlot } from "@/lib/wedding";

/**
 * 새 직접배달 주문 생성 (공개) — P1-1: 브라우저 create_delivery_v3 직접 호출 대체.
 * 개인 초대 토큰(P1-2): 토큰이 있으면 group 은 서버가 토큰의 group 으로 강제하고
 * (클라이언트 groupId 와 불일치 시 403 invite_group_mismatch), 연락처는 RPC 가
 * 토큰 해시로 채운다. 생성된 참여자는 group_member 와 연결한다.
 */
const RIDERS = ["신랑", "신부", "신랑+신부"] as const;

export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return json({ error: "server_not_configured" }, 503);

  if (!(await rateLimitAllow(`delivery:create:${clientIp(req)}`, 10, 600)))
    return json({ error: "rate_limited" }, 429);

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return json({ error: "bad_request" }, 400);

  // 초대 토큰 결속 (P1-2) — 형식이 유효한데 명단에 없으면 401
  const inviteToken =
    typeof b.inviteToken === "string" && b.inviteToken ? b.inviteToken : null;
  const invite = inviteToken ? await resolveInvite(inviteToken) : null;
  if (inviteToken && !invite) return json({ error: "invite_invalid" }, 401);

  const clientGroupId = parseUuid(b.groupId);
  if (invite && clientGroupId && clientGroupId !== invite.groupId)
    return json({ error: "invite_group_mismatch" }, 403);
  // 초대가 있으면 group 은 항상 토큰의 group (클라이언트 값 불신)
  const groupId = invite ? invite.groupId : clientGroupId;

  const name = parseName(b.name) ?? (invite ? parseName(invite.name) : null);
  if (!name) return json({ error: "name_invalid" }, 400);

  // 연락처 — 초대 토큰이 있으면 RPC 가 서버측 값으로 채움. 없으면 형식 검증.
  const phone = invite ? null : parsePhone(b.phone);
  if (!invite && !phone) return json({ error: "phone_invalid" }, 400);

  const location = parseText(b.location, 200);
  if (!location || location.length < 2) return json({ error: "location_invalid" }, 400);

  const date = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null;
  if (!date) return json({ error: "date_invalid" }, 400);

  const slot = TIME_SLOTS.includes(b.time as TimeSlot) ? (b.time as TimeSlot) : null;
  if (!slot || !slotsForDate(date).includes(slot))
    return json({ error: "time_invalid" }, 400);

  const rider = RIDERS.includes(b.rider as never) ? (b.rider as string) : "신랑";
  const message = parseText(b.message, 300);
  const convertToken = parseManageTokenParam(b.convertToken);

  const { data, error } = await supabaseAdmin.rpc("create_delivery_v3", {
    p_group_id: groupId,
    p_name: name,
    p_phone: phone ?? "",
    p_location: location,
    p_date: date,
    p_time: slot,
    p_message: message,
    p_convert_token: convertToken,
    p_rider: rider,
    p_invite_token: invite ? inviteToken : null,
  });
  if (error) {
    const e = rpcErrorCode(error.message);
    if (e.code === "server_error")
      console.error("[api/delivery/create] create_delivery_v3:", error.message);
    return json({ error: e.code }, e.status);
  }

  const row = firstRow<{
    delivery_id: string;
    participant_id: string;
    manage_token: string | null;
  }>(data);
  if (!row?.participant_id) return json({ error: "server_error" }, 500);
  if (invite) await linkGroupMember(row.participant_id, invite.memberId);

  return json({ manage_token: row.manage_token, participant_id: row.participant_id });
}
