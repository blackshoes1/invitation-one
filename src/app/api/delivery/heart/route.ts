import { after } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { drainNotifications } from "@/lib/notifyOutbox";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import { json, parseName, parsePhone, parseText, loadGroupById, resolveInvite, firstRow, rpcErrorCode } from "@/lib/deliveryApi";
import { resolveOrderKind } from "@/lib/orderKind";
import { isValidAnonAlias } from "@/lib/anonAlias";
import { REGIONS, OVERSEAS, joinRegion } from "@/lib/regions";
import { STAMPS } from "@/lib/wedding";

/**
 * 마음배송(축하 한마디) 생성 (공개) — P1-1: 브라우저 send_heart_v2 직접 호출 대체.
 * 검증: 이름 길이 · 지역 allowlist · 스탬프 allowlist · 메시지 길이 · 연락처 형식 ·
 *       공개 범위 enum · 익명 별명 조합(P1-3, 불일치 시 서버 결정적 생성).
 */
const DISPLAY_MODES = ["name", "initial", "anon"] as const;
const ATTENDANCES = ["yes", "maybe", "no"] as const;

export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return json({ error: "server_not_configured" }, 503);

  // 공용 Wi-Fi(가족 동시 제출)를 고려해 여유 있게: IP 당 10분 20회
  if (!(await rateLimitAllow(`heart:create:${clientIp(req)}`, 20, 600)))
    return json({ error: "rate_limited" }, 429);

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return json({ error: "bad_request" }, 400);

  const inviteToken = b.inviteToken == null || b.inviteToken === "" ? null : b.inviteToken;
  const invite = inviteToken ? await resolveInvite(inviteToken) : null;
  if (inviteToken !== null && !invite) return json({ error: "invite_invalid" }, 401);
  const group = await loadGroupById(b.groupId);
  if (b.groupId != null && b.groupId !== "" && !group)
    return json({ error: "group_invalid" }, 400);
  const kind = resolveOrderKind({ group, invite });
  if (!kind.ok) return json({ error: kind.error }, 403);

  const name = parseName(invite ? invite.name : b.name);
  if (!name) return json({ error: "name_invalid" }, 400);

  // 지역 — 시/도는 allowlist, 국내 구·군도 allowlist, 해외는 나라명 자유 입력(≤30자)
  const sido = String(b.sido ?? "").trim();
  const sub = String(b.sub ?? "").trim();
  const domestic = Object.prototype.hasOwnProperty.call(REGIONS, sido);
  if (!domestic && sido !== OVERSEAS) return json({ error: "region_invalid" }, 400);
  if (domestic && !REGIONS[sido].includes(sub))
    return json({ error: "region_invalid" }, 400);
  if (!domestic && (sub.length < 1 || sub.length > 30))
    return json({ error: "region_invalid" }, 400);

  const stamp = String(b.stamp ?? "");
  if (!(STAMPS as readonly string[]).includes(stamp))
    return json({ error: "stamp_invalid" }, 400);

  const message = parseText(b.message, 500);
  const phone = b.phone == null || String(b.phone).trim() === "" ? null : parsePhone(b.phone);
  if (b.phone != null && String(b.phone).trim() !== "" && phone === null)
    return json({ error: "phone_invalid" }, 400);

  const displayMode = DISPLAY_MODES.includes(b.displayMode as never)
    ? (b.displayMode as string)
    : "anon";
  const attendance = ATTENDANCES.includes(b.attendance as never)
    ? (b.attendance as string)
    : null;
  // 별명은 허용 목록 조합일 때만 그대로 저장 — 아니면 null → DB 가 결정적 생성 (P1-3)
  const anonAlias = isValidAnonAlias(b.anonAlias) ? b.anonAlias : null;

  const { data, error } = await supabaseAdmin.rpc("send_heart_v3", {
    p_group_id: kind.groupId,
    p_invite_token: inviteToken,
    p_name: name,
    p_region: joinRegion(sido, sub),
    p_stamp: stamp,
    p_message: message,
    p_phone: phone,
    p_display_mode: displayMode,
    p_is_private: b.isPrivate === true,
    p_show_region: b.showRegion !== false,
    p_attendance: attendance,
    p_anon_alias: anonAlias,
  });
  if (error) {
    const e = rpcErrorCode(error.message);
    if (e.code === "server_error")
      console.error("[api/delivery/heart] send_heart_v3:", error.message);
    return json({ error: e.code }, e.status);
  }

  const row = firstRow<{ participant_id: string; manage_token: string | null }>(data);
  if (!row?.participant_id) return json({ error: "server_error" }, 500);
  // P1-4: 응답 후 아웃박스 드레인 — 신규 알림 즉시 시도 + 이전 실패분(재시도 도래) 처리.
  // 트래픽이 있는 한 실패 알림이 다음 신청 시점에 재발송된다 (안전망 cron 은 별도).
  // 에러를 삼키지 않는다 — 여기서 조용히 죽으면 알림이 왜 안 갔는지 알 길이 없다
  after(() =>
    void drainNotifications(3).catch((e) =>
      console.error("[outbox] drain failed (after):", e)
    )
  );

  // participant_id(공개 식별자)는 내려주지 않음 — 관리에는 manage_token 만 사용
  return json({ manage_token: row.manage_token });
}
