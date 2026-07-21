import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { rateLimit, rateLimitResponse, clientIp } from "@/lib/rateLimit";
import { PASS_HEADERS } from "@/lib/checkinServer";
import { isValidPhone } from "@/lib/wedding";

/**
 * RSVP 제출·수정 (공개) — 체크인 v2 (docs/CHECKIN_SEATING_SPEC.md §8.1)
 * 브라우저의 submit_rsvp 직접 RPC 를 대체한다 (v24 에서 anon 실행 회수).
 * 토큰 반환 정책: 신규 제출(inserted)만 passToken 일회 반환. 기존 수정은 null —
 * 이름+연락처는 인증 수단이 아니므로 저장된 토큰을 공개 경로로 노출하지 않는다.
 */

type Eating = "yes" | "no" | "undecided";

interface Body {
  name?: string;
  phone?: string;
  side?: string;
  attending?: boolean;
  companionCount?: number;
  children?: number;
  kidsMeal?: boolean;
  eating?: string;
  memo?: string;
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? Math.trunc(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export async function POST(req: Request) {
  if (!isAdminConfigured || !supabaseAdmin)
    return NextResponse.json(
      { error: "서버 설정이 필요합니다." },
      { status: 503, headers: PASS_HEADERS }
    );

  // 공개 쓰기 — fail-closed rate limit (IP 당 10회/10분)
  const rl = await rateLimit(`rsvp:${clientIp(req)}`, 10, 600, true);
  if (!rl.ok) return rateLimitResponse(rl);

  const body = (await req.json().catch(() => ({}))) as Body;

  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (name.length < 2)
    return NextResponse.json(
      { error: "성함을 2자 이상 입력해 주세요." },
      { status: 400, headers: PASS_HEADERS }
    );
  if (!isValidPhone(phone))
    return NextResponse.json(
      { error: "연락처 형식이 올바르지 않습니다." },
      { status: 400, headers: PASS_HEADERS }
    );
  const side = body.side === "bride" ? "bride" : "groom";
  const attending = body.attending === true;
  const companions = attending ? clampInt(body.companionCount, 0, 19, 0) : 0;
  const children = attending ? clampInt(body.children, 0, companions, 0) : 0;
  const kidsMeal = attending && body.kidsMeal === true;
  const eating: Eating = attending
    ? body.eating === "no" || body.eating === "undecided"
      ? body.eating
      : "yes"
    : "no";
  const memo = String(body.memo ?? "").trim().slice(0, 500) || null;

  const { data, error } = await supabaseAdmin.rpc("submit_rsvp_v2", {
    p_name: name,
    p_phone: phone,
    p_side: side,
    p_attending: attending,
    p_companions: companions,
    p_children: children,
    p_kids_meal: kidsMeal,
    p_meal: eating,
    p_memo: memo,
  });
  if (error) {
    console.error("[rsvp] submit_rsvp_v2 실패:", error.message);
    return NextResponse.json(
      { error: "전송에 실패했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500, headers: PASS_HEADERS }
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { result: string; rsvp_id: string; pass_token: string | null }
    | undefined;
  if (!row)
    return NextResponse.json(
      { error: "전송에 실패했습니다." },
      { status: 500, headers: PASS_HEADERS }
    );

  // 신규 + 참석만 토큰 일회 반환
  const passToken = row.result === "inserted" ? row.pass_token : null;
  return NextResponse.json(
    {
      result: row.result,
      passToken,
      passUrl: passToken ? `/checkin?t=${passToken}` : null,
    },
    { headers: PASS_HEADERS }
  );
}
