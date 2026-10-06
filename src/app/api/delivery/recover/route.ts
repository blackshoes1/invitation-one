import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rateLimitAllow, clientIp } from "@/lib/rateLimit";
import { consumeRecoveryToken } from "@/lib/recoveryToken";
import { rotateManageToken } from "@/lib/manageToken";

/**
 * 복구 링크 교환 (문제 4) — 문자로 받은 단기 토큰을 관리 링크로 바꾼다.
 *
 * **관리 토큰 회전은 여기서만 일어난다.** 찾기 요청 단계에서 회전하면 인증되지
 * 않은 요청만으로 남의 기존 관리 링크를 끊어 놓을 수 있다. 번호 소유자가 문자를
 * 받아 링크를 실제로 열었을 때 비로소 회전한다.
 *
 * 복구 토큰은 1회용이고 만료가 있다. 없음·만료·이미 사용을 구분해 알려주지
 * 않는다 (열거 방지). 동시 교환은 DB 의 단일 update 로 막는다.
 */
const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  if (!supabaseAdmin)
    return NextResponse.json({ error: "server_not_configured" }, { status: 503, headers: NO_STORE });

  // 토큰 대입 방지 (128bit 라 사실상 불가하지만 비용은 막는다)
  if (!(await rateLimitAllow(`recover:${clientIp(req)}`, 20, 600)))
    return NextResponse.json({ error: "too_many_requests" }, { status: 429, headers: NO_STORE });

  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const participantId = await consumeRecoveryToken(body?.token);
  if (!participantId)
    return NextResponse.json({ error: "invalid" }, { status: 401, headers: NO_STORE });

  // 여기서 회전 — 이 시점부터 예전 관리 링크는 무효다 (본인이 새 링크를 받았으므로)
  const manage = await rotateManageToken(participantId);
  if (!manage)
    return NextResponse.json({ error: "invalid" }, { status: 401, headers: NO_STORE });

  return NextResponse.json(
    { manage_url: `/delivery/manage/${manage}` },
    { headers: NO_STORE }
  );
}
