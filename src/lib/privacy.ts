/** 운영 명단은 예식 후 30일까지, 사진·축하 글은 기념용으로 별도 보존합니다. */
export const PRIVACY_RETENTION_END = "2026-11-17T11:00:00+09:00";
export const PRIVACY_POLICY_VERSION = "2026-10-14";
export const PRIVACY_RETENTION_LABEL = "2026년 11월 17일 오전 11시";

export function collectionClosed(now = Date.now()): boolean {
  return now >= Date.parse(PRIVACY_RETENTION_END);
}

export function collectionGuard(): Response | null {
  return collectionClosed()
    ? Response.json({ error: "개인정보 수집 기간이 종료되었습니다." }, { status: 410 })
    : null;
}
