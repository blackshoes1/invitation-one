/** 그룹 명단의 동반자 (group_members.companions) — 서버·클라이언트 공용 순수 로직 */

/** 현장 체크인 인원 상한(20명)에서 본인을 뺀 값 */
export const MAX_COMPANIONS = 19;
const MAX_NAME = 40;

/** 참석 인원(본인 포함) → 동반자 입력칸 수 */
export function companionSlots(partySize: number): number {
  const n = Math.trunc(partySize);
  if (!Number.isFinite(n) || n < 2) return 0;
  return Math.min(n - 1, MAX_COMPANIONS);
}

/** 입력값 → 동반자 이름 배열. 빈 이름은 빈 칸으로 남겨 인원 수를 보존한다. */
export function normalizeCompanions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, MAX_COMPANIONS)
    .map((v) => (typeof v === "string" ? v.trim().slice(0, MAX_NAME) : ""));
}

/** 명단 행 표시 — "홍길동 외 2명 (김철수, 이영희)" */
export function formatRosterLabel(name: string, companions: string[]): string {
  if (companions.length === 0) return name;
  const named = companions.filter(Boolean);
  const base = `${name} 외 ${companions.length}명`;
  return named.length > 0 ? `${base} (${named.join(", ")})` : base;
}
