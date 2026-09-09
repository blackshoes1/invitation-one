/** 그룹 명단 이름 목록 — 클라이언트·서버 공용 타입 (시크릿 없음) */

export interface RosterName {
  name: string;
  /**
   * 이 이름을 고르면 **서버가** 연락처를 채워줄 수 있는가.
   *
   * 번호 자체는 (마스킹본조차) 내려오지 않는다 — 제출 시점에 서버가 붙인다.
   * 동명이인이면 누구 번호인지 정할 수 없으므로 false 다.
   */
  hasPhone: boolean;
}

/** 고른 이름 — 화면과 제출이 같은 값을 쓰도록 한 덩어리로 들고 다닌다 */
export interface PickedName {
  name: string;
  /** 연락처를 명단에서 채우는 중 (하객이 "다른 번호 쓰기"를 누르면 false) */
  usePhone: boolean;
}
