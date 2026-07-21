import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 체크인 v2 서버 공통 (docs/CHECKIN_SEATING_SPEC.md).
 * API 라우트 전용 — 클라이언트에서 import 금지.
 */

/** 공개 체크인 API 필수 응답 헤더 (§8.4) — 캐시·색인·리퍼러 차단 */
export const PASS_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

export function passJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: PASS_HEADERS });
}

export type CheckinWindowState =
  | "ok"
  | "checkin_not_enabled"
  | "checkin_not_open"
  | "checkin_closed";

/**
 * 체크인 운영 시간 판정 (§10). site_settings 서버 전용 키를 service role 로 조회.
 * 공개 RPC(get_site_settings)에는 노출하지 않는다. 관리자 수동 체크인은 이 판정을 거치지 않는다.
 */
export async function getCheckinWindow(
  admin: SupabaseClient
): Promise<CheckinWindowState> {
  const { data } = await admin
    .from("site_settings")
    .select("key, value")
    .in("key", ["checkin_enabled", "checkin_open_at", "checkin_close_at"]);

  const map: Record<string, unknown> = {};
  for (const row of data ?? []) map[row.key] = row.value;

  if (map.checkin_enabled !== true) return "checkin_not_enabled";

  const now = Date.now();
  const openAt =
    typeof map.checkin_open_at === "string" ? Date.parse(map.checkin_open_at) : NaN;
  const closeAt =
    typeof map.checkin_close_at === "string" ? Date.parse(map.checkin_close_at) : NaN;

  if (!Number.isNaN(openAt) && now < openAt) return "checkin_not_open";
  if (!Number.isNaN(closeAt) && now > closeAt) return "checkin_closed";
  return "ok";
}

/** UUID 형태 검사 — DB 왕복 전에 형식 오류를 invalid_pass 로 걸러냄 */
export function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}

/** 전화번호에서 숫자만 */
export function digits(v: string): string {
  return v.replace(/\D/g, "");
}

/* ------------------------------------------------------------------ *
 * 체크인 생성/조회 공통
 * ------------------------------------------------------------------ */

export interface SeatInfo {
  tableName: string;
  zone: string | null;
  floor: string | null;
  locationNote: string | null;
}

export interface CheckinRow {
  id: string;
  rsvp_id: string | null;
  actual_party_size: number | null;
  meal_count: number | null;
  created_at: string;
}

/** 배정 좌석 조회 — 미배정/비활성 테이블이면 null */
export async function fetchSeat(
  admin: SupabaseClient,
  tableId: string | null
): Promise<SeatInfo | null> {
  if (!tableId) return null;
  const { data } = await admin
    .from("seating_tables")
    .select("name, zone, floor, location_note, active")
    .eq("id", tableId)
    .maybeSingle();
  if (!data || !data.active) return null;
  return {
    tableName: data.name,
    zone: data.zone,
    floor: data.floor,
    locationNote: data.location_note,
  };
}

/** RSVP 의 활성 체크인 조회 (멱등 응답용) */
export async function fetchActiveCheckin(
  admin: SupabaseClient,
  rsvpId: string
): Promise<CheckinRow | null> {
  const { data } = await admin
    .from("checkins")
    .select("id, rsvp_id, actual_party_size, meal_count, created_at")
    .eq("rsvp_id", rsvpId)
    .eq("status", "active")
    .maybeSingle();
  return (data as CheckinRow | null) ?? null;
}

/**
 * 체크인 insert — checkins_active_rsvp_uniq 가 동시 요청을 한 건으로 보장.
 * unique 충돌(23505)이면 기존 활성 체크인을 반환한다(멱등).
 */
export async function insertCheckin(
  admin: SupabaseClient,
  fields: {
    rsvp_id: string | null;
    name: string | null;
    side: string | null;
    expected_party_size: number | null;
    actual_party_size: number;
    meal_count: number;
    source: "personal_qr" | "common_qr" | "admin" | "walk_in";
    checked_in_by: string;
    admin_memo?: string | null;
  }
): Promise<{ result: "checked_in" | "already_checked_in"; checkin: CheckinRow }> {
  const { data, error } = await admin
    .from("checkins")
    .insert({
      ...fields,
      // 레거시 party_size 컬럼(not null, 1..20)은 앱 전환 완료까지 함께 기록
      party_size: fields.actual_party_size,
      status: "active",
    })
    .select("id, rsvp_id, actual_party_size, meal_count, created_at")
    .single();

  if (!error) return { result: "checked_in", checkin: data as CheckinRow };

  if (error.code === "23505" && fields.rsvp_id) {
    const existing = await fetchActiveCheckin(admin, fields.rsvp_id);
    if (existing) return { result: "already_checked_in", checkin: existing };
  }
  throw new Error(`checkin insert 실패: ${error.message}`);
}
