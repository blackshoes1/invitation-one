import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashManageToken } from "@/lib/manageToken";

/**
 * 관리 링크 복구 토큰 (문제 4). 서버 전용.
 *
 * '내 신청 찾기'는 이름 + 연락처 뒤 4자리 + 배송일로 그 자리에서 관리 토큰을
 * 내주고 있었다. 그 셋은 조회 단서지 본인 인증이 아니다 — 청첩장을 받은 사람이면
 * 대개 알고, 뒤 4자리는 1만 분의 1이라 시간을 들이면 뚫린다.
 *
 * 그래서 관리 토큰 대신 **단기 복구 토큰**을 만들어 DB 에 등록된 번호로 문자를
 * 보낸다. 브라우저 응답에는 아무 토큰도 담기지 않는다. 관리 토큰 회전은 복구
 * 링크를 실제로 **열었을 때** 일어난다 — 그래야 인증되지 않은 요청만으로 남의
 * 기존 링크를 끊어 놓을 수 없다.
 *
 * 저장은 해시만 한다 (관리 토큰과 동일 규약: SHA-256 hex).
 */

/** 복구 링크 유효 시간 — 문자를 받고 여는 데 충분하면서 짧게 */
export const RECOVERY_TTL_MS = 30 * 60 * 1000;

export const RECOVERY_TOKEN_RE = /^[0-9a-f]{32}$/;

export function isRecoveryTokenFormat(v: unknown): v is string {
  return typeof v === "string" && RECOVERY_TOKEN_RE.test(v);
}

/**
 * 복구 토큰 발급 — raw 를 돌려주되 **호출자는 문자로만 보내야 한다.**
 * 절대 HTTP 응답에 담지 말 것.
 */
export async function issueRecoveryToken(
  participantId: string
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const raw = crypto.randomBytes(16).toString("hex");
  const { error } = await supabaseAdmin.from("manage_recovery_tokens").insert({
    token_hash: hashManageToken(raw),
    participant_id: participantId,
    expires_at: new Date(Date.now() + RECOVERY_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("[recovery] 토큰 발급 실패:", error.message);
    return null;
  }
  return raw;
}

/**
 * 복구 토큰 교환 — 1회용. 성공하면 participant id.
 * 없음·만료·이미 사용을 구분해서 알려주지 않는다 (열거 방지).
 * 동시 교환은 DB 쪽 단일 update 로 막는다 (consume_recovery_token).
 */
export async function consumeRecoveryToken(token: unknown): Promise<string | null> {
  if (!isRecoveryTokenFormat(token) || !supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.rpc("consume_recovery_token", {
    p_hash: hashManageToken(token),
  });
  if (error) {
    console.error("[recovery] 토큰 교환 실패:", error.message);
    return null;
  }
  return typeof data === "string" ? data : null;
}

/**
 * rate-limit 키 — 개인정보를 원문으로 저장하지 않는다.
 * rl_hit 는 키를 DB 에 남기므로 번호·이름을 그대로 쓰면 그 자체가 유출이다.
 */
export function recipientKey(phone: string): string {
  return `recover:to:${crypto.createHash("sha256").update(phone).digest("hex").slice(0, 32)}`;
}
