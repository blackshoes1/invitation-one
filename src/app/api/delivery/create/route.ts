import { after } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { drainNotifications } from "@/lib/notifyOutbox";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import {
  json,
  parseName,
  parseText,
  parseManageTokenParam,
  resolvePhone,
  rosterPhone,
  resolveInvite,
  loadGroupBySlug,
  loadGroupById,
  linkGroupMember,
  firstRow,
  rpcErrorCode,
} from "@/lib/deliveryApi";
import { resolveOrderKind } from "@/lib/orderKind";
import { slotsForDate, TIME_SLOTS } from "@/lib/wedding";
import type { TimeSlot } from "@/lib/wedding";

/**
 * 새 직접배달 주문 생성 (공개) — P1-1: 브라우저 create_delivery_v3 직접 호출 대체.
 *
 * 주문 종류(그룹/개인)는 **서버가 진입 경로로 판정한다** (`resolveOrderKind`).
 * 폼은 자기가 어느 페이지에서 왔는지(`groupSlug`)만 알려주고, 종류를 계산해
 * 보내지 않는다 — 규칙이 갈라지지 않게.
 *
 * 초대 토큰(P1-2)은 **신원**만 담당한다: 폼은 연락처를 바꿔도 토큰을 계속 보내고,
 * 서버는 연락처만 분기한 뒤(`resolvePhone`) 참여자를 명단(group_member)과 연결한다.
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

  // 진입 경로 → 그룹. 클라이언트가 보낸 값이 아니라 서버가 조회한 그룹만 쓴다.
  // (groupId 는 구버전 폼 호환 경로 — loadGroupById 주석 참고)
  const claimsGroup =
    (typeof b.groupSlug === "string" && b.groupSlug.trim() !== "") ||
    (typeof b.groupId === "string" && b.groupId !== "");
  const group =
    (await loadGroupBySlug(b.groupSlug)) ?? (await loadGroupById(b.groupId));
  if (claimsGroup && !group) return json({ error: "group_invalid" }, 400);

  const kind = resolveOrderKind({ group, invite });
  if (!kind.ok) return json({ error: kind.error }, 403);
  const groupId = kind.groupId;

  const name = parseName(b.name) ?? (invite ? parseName(invite.name) : null);
  if (!name) return json({ error: "name_invalid" }, 400);

  // 연락처 — ① 직접 입력한 번호 ② 명단에서 고른 이름의 번호(여기서 붙인다)
  //          ③ 초대 토큰 (RPC 가 채운다)
  const picked =
    b.rosterName === true && !invite ? await rosterPhone(groupId, name) : null;
  const ph = resolvePhone(b.phone, Boolean(invite) || Boolean(picked));
  if (!ph.ok) return json({ error: "phone_invalid" }, 400);
  const phone = ph.phone ?? picked;

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

  // P1-4: 응답 후 아웃박스 드레인 (신규 + 재시도 도래분)
  // 에러를 삼키지 않는다 — 여기서 조용히 죽으면 알림이 왜 안 갔는지 알 길이 없다
  after(() =>
    void drainNotifications(3).catch((e) =>
      console.error("[outbox] drain failed (after):", e)
    )
  );

  return json({ manage_token: row.manage_token, participant_id: row.participant_id });
}
