/** 주문(담당자 신청) 일정 수정 상태 — 그룹 담당자가 신청한 일자·시간·장소 조정 */
export type EditSched = {
  id: string;
  date: string;
  time: string;
  location: string;
};
