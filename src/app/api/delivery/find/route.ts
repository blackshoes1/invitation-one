import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import { issueRecoveryToken, recipientKey } from "@/lib/recoveryToken";
import { sendSms, isSmsConfigured } from "@/lib/sms";
import { siteOrigin } from "@/lib/siteUrl";

/**
 * 내 신청 찾기 — **관리 링크 복구 요청** (문제 4).
 *
 * 예전에는 이름 + 연락처 뒤 4자리 + 배송일이 맞으면 그 자리에서 관리 토큰을
 * 회전 발급해 브라우저로 돌려줬다. 그 셋은 조회 단서지 본인 인증이 아니다 —
 * 청첩장을 받은 사람이면 대개 알고, 뒤 4자리는 1만 분의 1이다. 뚫리면 남의 주문을
 * 취소·변경할 수 있었고, **조회 성공만으로 기존 관리 링크가 즉시 무효화**돼서
 * 아무나 남의 링크를 끊어 놓을 수도 있었다.
 *
 * 지금은 일치하는 신청이 있으면 **DB 에 등록된 번호**로 단기 복구 링크를 문자로
 * 보낸다. 응답에는 관리 토큰도 전체 번호도 담기지 않고, 일치 여부와 무관하게
 * **같은 응답**을 준다 (존재 여부를 추측하기 어렵게). 관리 토큰 회전은 복구 링크를
 * 실제로 열었을 때 일어난다(`/api/delivery/recover`).
 *
 * 입력 UI 는 그대로다 — 하객이 아는 것은 달라지지 않았다.
 */
const NO_STORE = { "Cache-Control": "no-store" };

/** 일치 여부와 무관하게 돌려주는 공통 응답 */
const UNIFORM = {
  ok: true,
  message:
    "일치하는 신청이 있으면 신청할 때 남기신 번호로 관리 링크를 보내드렸어요. 문자를 확인해주세요 📩",
} as const;

export async function POST(req: Request) {
  if (!supabaseAdmin)
    return NextResponse.json({ error: "server_not_configured" }, { status: 503, headers: NO_STORE });

  // 본인확인 정보 대입 방지 — IP 당 10분 20회 (기존 유지)
  if (!(await rateLimitAllow(`find:${clientIp(req)}`, 20, 600)))
    return NextResponse.json({ error: "too_many_requests" }, { status: 429, headers: NO_STORE });

  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; last4?: unknown; date?: unknown }
    | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const last4 = typeof body?.last4 === "string" ? body.last4 : "";
  const date = typeof body?.date === "string" ? body.date : "";
  if (name.length < 2 || name.length > 30 || !/^\d{4}$/.test(last4) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers: NO_STORE });

  // 문자 비용 폭주 방지 — 전체 발송량 상한 (IP 를 바꿔 가며 눌러도 막힌다)
  if (!(await rateLimitAllow("recover:global", 100, 3600)))
    return NextResponse.json(UNIFORM, { headers: NO_STORE });

  const { data, error } = await supabaseAdmin.rpc("find_participants", {
    p_name: name, p_last4: last4, p_date: date,
  });
  // 오류도 공통 응답으로 — 실패 여부로 존재를 추측할 수 없게 한다 (로그에는 남긴다)
  if (error) {
    console.error("[find] find_participants 실패:", error.message);
    return NextResponse.json(UNIFORM, { headers: NO_STORE });
  }

  const rows = (Array.isArray(data) ? data : []) as { participant_id: string }[];
  const origin = siteOrigin(req);

  for (const r of rows.slice(0, 3)) {
    // 발송 대상 번호는 **DB 의 검증된 신청 정보**에서 가져온다.
    // 요청자가 입력한 번호로는 절대 보내지 않는다 (그러면 그냥 남의 링크 탈취다).
    const { data: p, error: pe } = await supabaseAdmin
      .from("participants")
      .select("phone")
      .eq("id", r.participant_id)
      .maybeSingle();
    if (pe || !p?.phone) continue; // 번호 없는 신청(관리자 일괄·마음배송)은 복구 불가

    // 수신 대상 단위 cooldown — 남의 번호로 문자 폭탄을 보낼 수 없게.
    // 키는 번호 해시다 (rl_hit 가 키를 DB 에 남기므로 원문을 쓰면 그 자체가 유출)
    if (!(await rateLimitAllow(recipientKey(p.phone), 3, 3600))) continue;

    const token = await issueRecoveryToken(r.participant_id);
    if (!token) continue;

    const sent = await sendSms(
      p.phone,
      `[청첩장배달] 신청 관리 링크예요 (30분간 유효)\n${origin}/delivery/recover/${token}`
    );
    // 발송 실패해도 기존 관리 링크는 그대로다 — 회전은 링크를 열 때 일어난다.
    // 약한 인증으로 우회하지 않는다: 토큰을 응답에 담지 않는다.
    if (!sent.ok) console.error("[find] 복구 문자 발송 실패");
    if (sent.skipped && !isSmsConfigured)
      console.warn("[find] SMS 미설정 — 복구 링크를 보내지 못했다");
  }

  return NextResponse.json(UNIFORM, { headers: NO_STORE });
}
