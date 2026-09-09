/**
 * SMS 발송 결과 → 관리자 화면 문구. 판정은 여기 한 곳에만 둔다.
 *
 * 고친 사고 (2026-09-09): 주문을 확정했더니 **"참여자 0/4명에게 SMS 발송 완료"**
 * 라고 떴다. 한 건도 못 보냈는데 "완료"다. 실패 이유는 응답(`results[].error`)에
 * 이미 들어 있었지만 화면이 그걸 버렸다. 그래서 신랑신부는 하객 4명이 확정 문자를
 * 받은 줄 알고 넘어갔다.
 *
 * 규칙: **한 건이라도 실패하면 초록 알림이 아니라 빨간 오류다.** 보낸 건수만
 * 세어 성공처럼 말하지 않는다. 이유를 같이 보여줘야 사람이 조치할 수 있다.
 */

export interface SmsAttempt {
  name?: string;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export interface SmsOutcome {
  count: number;
  sent: number;
  skipped: boolean;
  results?: SmsAttempt[];
}

/**
 * 실패 이유에서 **전화번호로 보이는 긴 숫자열을 지운다.**
 * 솔라피 오류 본문에 수신번호가 그대로 담겨 오는 경우가 있는데, 그게 화면 문구·
 * 스크린샷·버그 리포트로 흘러가면 안 된다. 오류 코드(3자리 등)는 남긴다.
 */
export function redactDigits(s: string): string {
  return s.replace(/\d[\d-]{7,}\d/g, "***");
}

const MAX_REASON = 120;

function reasonOf(results: SmsAttempt[] | undefined): string {
  const failed = (results ?? []).filter((r) => !r.ok && r.error);
  if (!failed.length) return "";
  const first = redactDigits(failed[0].error!).slice(0, MAX_REASON);
  return failed.length > 1 ? `${first} (외 ${failed.length - 1}건)` : first;
}

/**
 * `ok:false` 면 호출부는 **오류로** 띄워야 한다 (setNotice 가 아니라 setError).
 *
 * @param sms  서버 응답의 발송 결과 (없으면 발송 시도 자체가 없었다는 뜻)
 * @param done 발송과 함께 끝난 작업 이름 — "확정 처리", "일정 변경" 등.
 *             작업 자체는 성공했음을 문구에 남겨야 한다. 문자가 실패했다고
 *             주문이 확정 안 된 줄 알면 같은 작업을 또 하게 된다.
 */
export function describeSms(
  sms: SmsOutcome | null | undefined,
  done: string
): { ok: boolean; text: string } {
  if (!sms || sms.count === 0)
    return { ok: true, text: `${done}됐습니다 — 연락처 보유 참여자가 없어 SMS 미발송.` };

  if (sms.skipped)
    return {
      ok: true,
      text: `${done}됐습니다 — SMS는 솔라피 키 미설정으로 미발송 (${sms.count}명 대상).`,
    };

  if (sms.sent === sms.count)
    return { ok: true, text: `${done} 및 참여자 ${sms.count}명에게 SMS 발송 완료.` };

  const reason = reasonOf(sms.results);
  const tail = reason ? ` 사유: ${reason}` : " 사유가 응답에 없습니다.";

  if (sms.sent === 0)
    return {
      ok: false,
      text: `${done}는 됐지만 SMS가 ${sms.count}명 **전원 실패**했습니다. 하객은 아직 아무 연락도 못 받았습니다.${tail}`,
    };

  return {
    ok: false,
    text: `${done}는 됐지만 SMS가 ${sms.count}명 중 ${sms.sent}명에게만 갔습니다. 나머지 ${sms.count - sms.sent}명은 못 받았습니다.${tail}`,
  };
}
