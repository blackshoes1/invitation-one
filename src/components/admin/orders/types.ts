/** 주문(담당자 신청) 일정 수정 상태 — 그룹 담당자가 신청한 일자·시간·장소 조정 */
export type EditSched = {
  id: string;
  date: string;
  time: string;
  /**
   * 장소는 시/도·시/군/구·상세로 나눠 들고 있다가 저장할 때 한 문자열로 합친다
   * (`joinLocation`). 폼을 열 때는 `splitRegion` 으로 되돌린다.
   */
  sido: string;
  sub: string;
  detail: string;
};
