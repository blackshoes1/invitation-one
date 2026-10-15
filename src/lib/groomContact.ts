/**
 * 신랑 연락처 — **크롤러가 번호를 못 줍게** 숨겨 둔다.
 *
 * 번호를 HTML·JS 번들 어디에도 `010-…` 이나 `tel:` 형태로 남기지 않는다.
 * 문자 코드를 밀어 둔 숫자 배열로만 들고 있다가, 하객이 버튼을 **누른 순간**
 * 브라우저에서 풀어 전화 앱을 연다. 정규식으로 페이지·스크립트를 훑는
 * 수집기에는 전화번호처럼 보이는 문자열이 없다.
 *
 * (사람이 직접 눌러 확인하는 것까지 막을 수는 없다 — 목적은 자동 수집 방지다.)
 */
const SHIFT = 37;
const ENCODED = [85, 86, 85, 91, 91, 85, 85, 93, 86, 89, 90];

/** 숫자만 (예: 01012345678). 누를 때만 부른다 */
export function groomPhoneDigits(): string {
  return ENCODED.map((c) => String.fromCharCode(c - SHIFT)).join("");
}

/** 010-1234-5678 형태 — 연락처 저장(vCard)처럼 하객이 직접 받는 파일에만 쓴다 */
export function groomPhoneFormatted(): string {
  const d = groomPhoneDigits();
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 전화 앱 열기 — 링크를 그 자리에서 만들어 누르고 바로 지운다 (DOM 에 남지 않게) */
export function callGroom(): void {
  const a = document.createElement("a");
  a.href = `tel:${groomPhoneDigits()}`;
  a.rel = "nofollow";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
