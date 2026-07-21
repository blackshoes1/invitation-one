import { NextResponse } from "next/server";
import { supabaseAdmin, isAdminConfigured } from "@/lib/supabaseAdmin";
import { PASS_HEADERS, rsvpSubmitToken } from "@/lib/checkinServer";
import { isValidPhone } from "@/lib/wedding";

/**
 * RSVP 제출·수정 (공개) — 체크인 v2 (docs/CHECKIN_SEATING_SPEC.md §8.1)
 * 브라우저의 submit_rsvp 직접 RPC 를 대체한다 (v24 에서 anon 실행 회수).
 *
 * 남용 방어 (Upstash 없이 — §11 단계적 방어):
 * - 서버 전용 제출 토큰: 키 게이트를 통과한 청첩장 페이지(서버 컴포넌트)만
 *   폼에 토큰을 내려줄 수 있다. 번들 스크래핑으로는 얻을 수 없음.
 * - 허니팟 필드(website): 채워져 있으면 저장 없이 성공 흉내.
 * - 총량 상한: RSVP 행 수가 상한을 넘으면 접수 중단 (스팸 폭주 회로 차단기).
 *
 * 토큰 반환 정책: 신규 제출(inserted)만 passToken 일회 반환. 기존 수정은 null.
 */

type Eating = "yes" | "no" | "undecided";

const MAX_RSVP_ROWS = 400; // 단일 예식 상한 — 넘으면 스팸으로 간주하고 접수 중단

interface Body {
  submitToken?: string;
  website?: string; // 허니팟 — 사람은 채우지 않는 숨김 필드
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

  const expected = rsvpSubmitToken();
  if (!expected)
    // ADMIN_PASSWORD/INVITATION_KEY 미설정 — fail-closed
    return NextResponse.json(
      { error: "접수 준비가 되지 않았습니다." },
      { status: 503, headers: PASS_HEADERS }
    );

  const body = (await req.json().catch(() => ({}))) as Body;

  if (body.submitToken !== expected)
    return NextResponse.json(
      { error: "청첩장에서만 제출할 수 있어요." },
      { status: 403, headers: PASS_HEADERS }
    );

  // 허니팟 — 봇에게는 성공한 것처럼 응답하고 저장하지 않는다
  if (String(body.website ?? "").trim() !== "")
    return NextResponse.json(
      { result: "updated", passToken: null, passUrl: null },
      { headers: PASS_HEADERS }
    );

  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  if (name.length < 2 || name.length > 40)
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

  // 총량 상한 (회로 차단기) — 수정(upsert)도 막히지만 상한 도달 자체가 이상 상황
  const { count } = await supabaseAdmin
    .from("rsvp")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_RSVP_ROWS)
    return NextResponse.json(
      { error: "접수가 잠시 중단되었어요. 안내데스크에 문의해 주세요." },
      { status: 503, headers: PASS_HEADERS }
    );

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
