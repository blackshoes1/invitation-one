import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { passJson, checkEventKey, getCheckinWindow } from "@/lib/checkinServer";
import { checkinIdentity } from "@/lib/guestIdentity";
import { recordAccess } from "@/lib/privacyAudit";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";

/**
 * 공용 QR — RSVP 검색 (공개) — §4.4
 * 예식장 공용 QR 에 포함된 행사 키(?event=CHECKIN_EVENT_KEY)를 가진
 * 요청만 처리한다 (키 미설정 시 fail-closed). 익명 인터넷 전체에는
 * 닫혀 있고, 현장 QR 을 스캔한 사람에게만 열리는 게이트.
 * 문자 인증으로 확인된 본인의 참석 RSVP만 조회한다.
 * 전체 전화번호·토큰은 반환하지 않는다 (마스킹 + rsvpId 만).
 * 운영 시간 창(checkin_enabled + 개방/마감) 안에서만 동작하고 IP rate limit 을 건다.
 */
export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return passJson({ error: "server_not_configured" }, 503);

  const body = (await req.json().catch(() => ({}))) as {
    eventKey?: string;
    verificationToken?: string;
  };

  const gate = checkEventKey(body.eventKey);
  if (gate !== "ok")
    return passJson(
      { error: "event_key" },
      gate === "unset" ? 503 : 403
    );

  // 운영 시간 창 밖(체크인 비활성·개방 전·마감 후)에는 후보를 반환하지 않는다 (P1-4)
  const win = await getCheckinWindow(supabaseAdmin);
  if (win !== "ok") return passJson({ error: "window", state: win }, 403);

  // IP rate limit includes authenticated searches; allow for a shared venue network.
  if (!(await rateLimitAllow(`checkin-search:${clientIp(req)}`, 120, 600)))
    return passJson({ error: "rate_limited" }, 429);

  const rsvpId = await checkinIdentity(body.verificationToken);
  if (!rsvpId) return passJson({ error: "identity_required" }, 401);
  if (!await recordAccess(req, "guest_checkin_read", "allowed")) return passJson({ error: "audit_unavailable" }, 503);
  const { data, error } = await supabaseAdmin.from("rsvp")
    .select("id, name, phone, side, companion_count, table_id").eq("attending", true).eq("id", rsvpId);
  if (error) return passJson({ error: "search_failed" }, 500);
  const matched = data ?? [];

  // 체크인 여부 병기 (안내데스크·본인 확인용)
  const ids = matched.map((r) => r.id);
  const checkedSet = new Set<string>();
  if (ids.length > 0) {
    const { data: cks } = await supabaseAdmin
      .from("checkins")
      .select("rsvp_id")
      .in("rsvp_id", ids)
      .eq("status", "active");
    for (const c of cks ?? []) if (c.rsvp_id) checkedSet.add(c.rsvp_id);
  }

  return passJson({
    candidates: matched.map((r) => ({
      rsvpId: r.id,
      displayName: r.name,
      side: r.side,
      expectedPartySize: 1 + r.companion_count,
      alreadyCheckedIn: checkedSet.has(r.id),
      // 010-****-1234 마스킹 (동명이인 구분용)
      maskedPhone: r.phone
        ? r.phone.replace(/(\d{3})-?\d{3,4}-?(\d{4})/, "$1-****-$2")
        : null,
    })),
  });
}
