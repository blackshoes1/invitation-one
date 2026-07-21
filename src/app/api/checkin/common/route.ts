import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import {
  passJson,
  isUuid,
  digits,
  getCheckinWindow,
  fetchSeat,
  insertCheckin,
  checkEventKey,
} from "@/lib/checkinServer";

/**
 * 공용 QR — 검색된 RSVP 체크인 (공개) — §4.4
 * 행사 키(?event=) 게이트 통과 후, search 로 받은 rsvpId + 전화번호
 * 뒤 4자리를 재검증한 뒤 개인 QR 과 동일한 규칙으로 체크인한다
 * (source='common_qr'). rate limit 없음 — §11 단계적 방어 참고.
 */
export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return passJson({ result: "server_not_configured" }, 503);

  const body = (await req.json().catch(() => ({}))) as {
    eventKey?: string;
    rsvpId?: string;
    last4?: string;
    actualPartySize?: number;
    mealCount?: number;
  };

  const gate = checkEventKey(body.eventKey);
  if (gate !== "ok")
    return passJson({ result: "event_key" }, gate === "unset" ? 503 : 403);

  const last4 = digits(String(body.last4 ?? ""));
  if (!isUuid(body.rsvpId) || last4.length !== 4)
    return passJson({ result: "invalid_pass" });

  const { data: rsvp } = await supabaseAdmin
    .from("rsvp")
    .select("id, name, phone, side, attending, companion_count, table_id")
    .eq("id", body.rsvpId)
    .maybeSingle();
  if (!rsvp || !rsvp.phone || !digits(rsvp.phone).endsWith(last4))
    return passJson({ result: "invalid_pass" });
  if (!rsvp.attending) return passJson({ result: "not_attending" });

  const window_ = await getCheckinWindow(supabaseAdmin);
  if (window_ !== "ok") return passJson({ result: window_ });

  const actual = Math.trunc(Number(body.actualPartySize));
  if (!Number.isFinite(actual) || actual < 1 || actual > 20)
    return passJson({ result: "invalid_party_size" });
  let meal = Math.trunc(Number(body.mealCount));
  if (!Number.isFinite(meal)) meal = actual;
  if (meal < 0 || meal > actual)
    return passJson({ result: "invalid_party_size" });

  const { result, checkin } = await insertCheckin(supabaseAdmin, {
    rsvp_id: rsvp.id,
    name: rsvp.name,
    side: rsvp.side,
    expected_party_size: 1 + rsvp.companion_count,
    actual_party_size: actual,
    meal_count: meal,
    source: "common_qr",
    checked_in_by: "guest",
  });

  return passJson({
    result,
    checkin: {
      actualPartySize: checkin.actual_party_size,
      mealCount: checkin.meal_count,
      checkedInAt: checkin.created_at,
    },
    seat: await fetchSeat(supabaseAdmin, rsvp.table_id),
  });
}
