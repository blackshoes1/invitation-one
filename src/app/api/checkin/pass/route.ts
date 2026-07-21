import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import {
  passJson,
  isUuid,
  getCheckinWindow,
  fetchSeat,
  fetchActiveCheckin,
  insertCheckin,
} from "@/lib/checkinServer";

/**
 * 개인 QR 패스 (공개) — docs/CHECKIN_SEATING_SPEC.md §8.2~8.4
 * GET  ?t=<token> : 토큰 검증 + 최소 정보 (체크인 전에는 좌석 비노출)
 * POST {token, actualPartySize, mealCount} : 원자적·멱등 체크인
 * 토큰 오류는 존재 여부를 구분할 수 없게 invalid_pass 로 통합한다.
 *
 * rate limit 없음(의도) — §11 단계적 방어:
 * 토큰 자체가 128비트 비밀이라 무차별 대입이 비현실적이고, 운영 시간 +
 * 활성 1건 unique 가 남용을 막는다. 예식장 공유 WiFi(단일 IP)에서 하객이
 * 몰리는 상황에서 IP 제한은 정상 하객을 차단하는 역효과만 낸다.
 */

interface PassRsvp {
  id: string;
  name: string;
  side: string | null;
  attending: boolean;
  companion_count: number;
  children: number;
  checkin_token_active: boolean;
  table_id: string | null;
}

async function findByToken(token: string): Promise<PassRsvp | null> {
  const { data } = await supabaseAdmin!
    .from("rsvp")
    .select(
      "id, name, side, attending, companion_count, children, checkin_token_active, table_id"
    )
    .eq("checkin_token", token)
    .maybeSingle();
  return (data as PassRsvp | null) ?? null;
}

export async function GET(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return passJson({ valid: false, error: "server_not_configured" }, 503);

  const token = new URL(req.url).searchParams.get("t");
  if (!isUuid(token)) return passJson({ valid: false, error: "invalid_pass" });

  const rsvp = await findByToken(token);
  if (!rsvp || !rsvp.checkin_token_active || !rsvp.attending)
    return passJson({ valid: false, error: "invalid_pass" });

  const window_ = await getCheckinWindow(supabaseAdmin);
  const existing = await fetchActiveCheckin(supabaseAdmin, rsvp.id);

  return passJson({
    valid: true,
    alreadyCheckedIn: Boolean(existing),
    window: window_,
    guest: {
      displayName: rsvp.name,
      side: rsvp.side,
      expectedPartySize: 1 + rsvp.companion_count,
      children: rsvp.children,
    },
    // 이미 체크인한 경우에만 기존 기록·좌석 노출 (§4.2, §12)
    checkin: existing
      ? {
          actualPartySize: existing.actual_party_size,
          mealCount: existing.meal_count,
          checkedInAt: existing.created_at,
        }
      : null,
    seat: existing ? await fetchSeat(supabaseAdmin, rsvp.table_id) : null,
  });
}

export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return passJson({ result: "server_not_configured" }, 503);

  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    actualPartySize?: number;
    mealCount?: number;
  };
  if (!isUuid(body.token)) return passJson({ result: "invalid_pass" });

  const rsvp = await findByToken(body.token);
  if (!rsvp || !rsvp.checkin_token_active)
    return passJson({ result: "invalid_pass" });
  if (!rsvp.attending) return passJson({ result: "not_attending" });

  // 운영 시간 (§10) — 관리자 수동 체크인은 이 API 를 쓰지 않으므로 항상 적용
  const window_ = await getCheckinWindow(supabaseAdmin);
  if (window_ !== "ok") return passJson({ result: window_ });

  const actual = Math.trunc(Number(body.actualPartySize));
  if (!Number.isFinite(actual) || actual < 1 || actual > 20)
    return passJson({ result: "invalid_party_size" });
  let meal = Math.trunc(Number(body.mealCount));
  if (!Number.isFinite(meal)) meal = actual;
  if (meal < 0 || meal > actual)
    return passJson({ result: "invalid_party_size" });

  const expected = 1 + rsvp.companion_count;
  const { result, checkin } = await insertCheckin(supabaseAdmin, {
    rsvp_id: rsvp.id,
    name: rsvp.name,
    side: rsvp.side,
    expected_party_size: expected,
    actual_party_size: actual,
    meal_count: meal,
    source: "personal_qr",
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
