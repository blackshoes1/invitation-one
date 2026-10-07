/** 참석 등록의 동반자 (rsvp.companion_count / companion_names) — 서버·클라이언트 공용 순수 로직 */

/** 현장 체크인 인원 상한(20명)에서 본인을 뺀 값 */
export const MAX_COMPANIONS = 19;
const MAX_NAME = 40;

/** 동반 인원수 입력값 → 0..MAX_COMPANIONS 정수 (숫자가 아니면 0) */
export function clampCompanionCount(v: unknown): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.min(MAX_COMPANIONS, Math.max(0, Math.trunc(n)));
}

/** 입력값 → 동반자 이름 배열. 빈 이름은 빈 칸으로 남겨 인원 수를 보존한다. */
export function normalizeCompanions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, MAX_COMPANIONS)
    .map((v) => (typeof v === "string" ? v.trim().slice(0, MAX_NAME) : ""));
}

/** 동반 인원수에 맞춰 이름 칸을 늘리거나 줄인다 — 이미 적은 이름은 앞에서부터 유지 */
export function resizeCompanions(names: string[], count: number): string[] {
  const n = clampCompanionCount(count);
  return Array.from({ length: n }, (_, i) => names[i] ?? "");
}

/** 표시 — "외 2명 (김철수, 이영희)". 인원은 count 기준, 이름은 입력된 것만 */
export function formatCompanions(count: number, names: string[]): string {
  if (count <= 0) return "";
  const named = names.filter(Boolean);
  const base = `외 ${count}명`;
  return named.length > 0 ? `${base} (${named.join(", ")})` : base;
}
