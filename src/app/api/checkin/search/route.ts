import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { passJson, digits, checkEventKey } from "@/lib/checkinServer";

/**
 * 공용 QR — RSVP 검색 (공개) — §4.4
 * 예식장 공용 QR 에 포함된 행사 키(?event=CHECKIN_EVENT_KEY)를 가진
 * 요청만 처리한다 (키 미설정 시 fail-closed). 익명 인터넷 전체에는
 * 닫혀 있고, 현장 QR 을 스캔한 사람에게만 열리는 게이트.
 * 이름 + 전화번호 뒤 4자리로 참석 RSVP 를 찾는다.
 * 전체 전화번호·토큰은 반환하지 않는다 (마스킹 + rsvpId 만).
 */
export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return passJson({ error: "server_not_configured" }, 503);

  const body = (await req.json().catch(() => ({}))) as {
    eventKey?: string;
    name?: string;
    last4?: string;
    fullPhone?: string;
  };

  const gate = checkEventKey(body.eventKey);
  if (gate !== "ok")
    return passJson(
      { error: "event_key" },
      gate === "unset" ? 503 : 403
    );

  const name = String(body.name ?? "").trim();
  const last4 = digits(String(body.last4 ?? ""));
  const fullPhone = digits(String(body.fullPhone ?? ""));
  if (name.length < 2 || last4.length !== 4)
    return passJson({ error: "bad_request" }, 400);

  const { data, error } = await supabaseAdmin
    .from("rsvp")
    .select("id, name, phone, side, companion_count, table_id")
    .eq("attending", true)
    .eq("name", name);
  if (error) return passJson({ error: "search_failed" }, 500);

  let matched = (data ?? []).filter(
    (r) => r.phone && digits(r.phone).endsWith(last4)
  );
  if (fullPhone.length >= 9)
    matched = matched.filter((r) => digits(r.phone!) === fullPhone);

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
