import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { rateLimit, rateLimitResponse, clientIp } from "@/lib/rateLimit";
import { passJson, getCheckinWindow, insertCheckin } from "@/lib/checkinServer";

/**
 * 공용 QR — 현장 하객 등록 (공개) — §4.4
 * RSVP 없이 방문한 하객. rsvp_id=null, source='walk_in' 으로 저장.
 */
export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return passJson({ result: "server_not_configured" }, 503);

  const rl = await rateLimit(`pass-walkin:${clientIp(req)}`, 10, 60, true);
  if (!rl.ok) return rateLimitResponse(rl);

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    side?: string;
    actualPartySize?: number;
    mealCount?: number;
  };
  const name = String(body.name ?? "").trim().slice(0, 40);
  if (name.length < 2) return passJson({ result: "bad_request" }, 400);
  const side =
    body.side === "groom" || body.side === "bride" ? body.side : null;

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
    rsvp_id: null,
    name,
    side,
    expected_party_size: null,
    actual_party_size: actual,
    meal_count: meal,
    source: "walk_in",
    checked_in_by: "guest",
  });

  return passJson({
    result,
    checkin: {
      actualPartySize: checkin.actual_party_size,
      mealCount: checkin.meal_count,
      checkedInAt: checkin.created_at,
    },
    seat: null,
  });
}
