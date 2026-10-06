import type { TimeSlot } from "@/lib/wedding";

export const SLOTS: { value: TimeSlot; emoji: string }[] = [
  { value: "오전", emoji: "🌅" },
  { value: "점심", emoji: "🍚" },
  { value: "오후", emoji: "☀️" },
  { value: "저녁", emoji: "🌙" },
];

export type Rider = "신랑" | "신부" | "신랑+신부";
export const RIDERS: { value: Rider; emoji: string; desc: string }[] = [
  { value: "신랑", emoji: "🤵", desc: "신랑이 갈게요" },
  { value: "신부", emoji: "👰", desc: "신부가 갈게요" },
  { value: "신랑+신부", emoji: "💑", desc: "둘이 같이 갈게요" },
];

export const DELIVERY_STEPS = ["받는 지역", "날짜·시간", "전달 방법", "확인"] as const;
export const TOTAL = DELIVERY_STEPS.length;
export const DRAFT_KEY = "delivery-form-draft";

/** 새로고침/이탈 복원용 초안 — 개인정보(이름·연락처·배송지)는 저장하지 않는다 (P2-3) */
export interface Draft {
  date: string | null;
  slot: TimeSlot | null;
  rider: Rider | null;
  message: string;
}

/** get_orders_on_date RPC — 같은 날 기존 주문 (이름은 서버에서 마스킹) */
export interface DateOrder {
  id: string;
  time_slot: TimeSlot;
  member_count: number;
  owner_masked: string | null;
}
