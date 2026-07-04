import { DELIVERY_START, DELIVERY_END } from "@/lib/wedding";

export interface OfferFields {
  offer_date: string | null;
  offer_time: string | null;
  offer_location: string | null;
}

/** 그룹 제안 일정 입력 검증 (Admin API 용) — 통과 시 fields, 실패 시 error */
export function parseOffer(body: {
  offer_date?: string | null;
  offer_time?: string | null;
  offer_location?: string | null;
}): { fields: OfferFields } | { error: string } {
  const date = body.offer_date?.trim() || null;
  const time = body.offer_time?.trim() || null;
  const location = body.offer_location?.trim() || null;
  if (!date && !time)
    return { fields: { offer_date: null, offer_time: null, offer_location: null } };
  if (!date || !time)
    return { error: "제안 일정은 날짜와 시간대를 함께 입력해주세요." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { error: "날짜 형식이 올바르지 않습니다." };
  if (date < DELIVERY_START || date > DELIVERY_END)
    return { error: "제안 날짜는 신청 기간(7/6~10/16) 안이어야 합니다." };
  if (!["오전", "오후", "저녁"].includes(time))
    return { error: "시간대는 오전/오후/저녁 중 하나여야 합니다." };
  return { fields: { offer_date: date, offer_time: time, offer_location: location } };
}
