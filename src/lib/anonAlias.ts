/**
 * 익명 별명 — "형용사 + 동물" (예: 수줍은 펭귄). 클라이언트 미리보기/제안용.
 * 서버(DB `_anon_alias`)는 participant id 로 결정적 별명을 만들고, 클라이언트가 보낸 별명은
 * 형식(한글 2~8자 + 공백 + 한글 1~6자)만 맞으면 그대로 저장한다. 목록은 DB 함수와 동일하게 유지.
 */
export const ANON_ADJECTIVES = [
  "수줍은", "용감한", "행복한", "다정한", "느긋한", "씩씩한", "반짝이는", "포근한", "명랑한", "상냥한",
  "든든한", "조용한", "설레는", "유쾌한", "귀여운", "늠름한", "사랑스러운", "총총한", "싱그러운", "따뜻한",
];
export const ANON_ANIMALS = [
  "펭귄", "수달", "다람쥐", "고래", "판다", "코알라", "토끼", "고슴도치", "사슴", "여우",
  "햄스터", "물개", "부엉이", "돌고래", "알파카", "거북이", "오리", "강아지", "고양이", "양",
];
export const ANON_ALIAS_RE = /^[가-힣]{2,8} [가-힣]{1,6}$/;

export function randomAnonAlias(): string {
  const a = ANON_ADJECTIVES[Math.floor(Math.random() * ANON_ADJECTIVES.length)];
  const b = ANON_ANIMALS[Math.floor(Math.random() * ANON_ANIMALS.length)];
  return `${a} ${b}`;
}

/**
 * 서버 검증 (P1-3): 별명이 정확히 "허용 형용사 + 공백 + 허용 동물" 조합인지 확인.
 * 두 목록이 single source of truth — 형식 regex 만으로는 임의 한글 문구
 * ("공짜 쿠폰" 등)가 공개 피드에 노출될 수 있어 조합 자체를 검사한다.
 * 불일치 시 저장하지 않고 서버(DB _anon_alias)가 결정적 별명을 생성한다.
 */
export function isValidAnonAlias(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const sp = v.indexOf(" ");
  if (sp <= 0 || v.indexOf(" ", sp + 1) !== -1) return false;
  return (
    ANON_ADJECTIVES.includes(v.slice(0, sp)) &&
    ANON_ANIMALS.includes(v.slice(sp + 1))
  );
}
