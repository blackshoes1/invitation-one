import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 클라이언트 (브라우저용).
 * .env.local 에 아래 두 값을 넣으면 활성화됩니다.
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
 * 값이 없으면 null 을 반환하고, RSVP 폼은 "데모 모드"로 동작합니다.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = Boolean(url && anonKey);

export interface RsvpPayload {
  name: string;
  side: "groom" | "bride";
  attending: boolean;
  companion_count: number;
  eating: "yes" | "no" | "undecided";
  memo: string;
}

export type DeliveryStatus = "대기중" | "확정" | "완료" | "취소";
export type TimeSlotValue = "오전" | "오후" | "저녁";

/** 배송 추적 4단계 (status 와 별개로 Admin 이 수동 전환) */
export type TrackingStage = "주문접수" | "준비중" | "배송출발" | "배송완료";
export const TRACKING_STAGES: TrackingStage[] = [
  "주문접수",
  "준비중",
  "배송출발",
  "배송완료",
];

export interface Delivery {
  id: string;
  created_at: string;
  updated_at: string;
  group_id: string | null;
  name: string;
  phone: string;
  location: string;
  date: string; // YYYY-MM-DD
  time_slot: TimeSlotValue;
  party_size: number | null;
  message: string | null;
  status: DeliveryStatus;
  tracking_stage: TrackingStage;
  review_rating: number | null;
  review_text: string | null;
}

export type DeliveryInsert = Pick<
  Delivery,
  "group_id" | "name" | "phone" | "location" | "date" | "time_slot" | "party_size" | "message"
>;

/** get_delivery RPC 반환 (취소/변경·추적·리뷰 페이지용) */
export interface DeliveryDetail {
  id: string;
  group_id: string | null;
  name: string;
  location: string;
  date: string;
  time_slot: TimeSlotValue;
  party_size: number | null;
  status: DeliveryStatus;
  tracking_stage: TrackingStage;
  review_rating: number | null;
  review_text: string | null;
}

/** get_public_reviews RPC 반환 (직접 배달 공개 리뷰) */
export interface PublicReview {
  name: string;
  review_rating: number;
  review_text: string | null;
  created_at: string;
}

/** get_journey_pins RPC 반환 (배송 완료 지도 핀) */
export interface JourneyPin {
  name: string;
  date: string;
  area: string;
  created_at: string;
}

/** verify_guest RPC 반환 (본인 확인) */
export interface VerifyResult {
  name: string;
  date: string;
  time_slot: TimeSlotValue;
  status: DeliveryStatus;
  tracking_stage: TrackingStage;
  review_rating: number | null;
  guest_no: number | null;
}

export interface Group {
  id: string;
  name: string;
  slug: string;
}

export interface GroupMember {
  name: string;
  date: string;
  time_slot: "오전" | "오후" | "저녁";
}

/** 명단(로스터) + 신청 상태 */
export interface GroupStatusMember {
  name: string;
  applied: boolean;
  date: string | null;
  time_slot: "오전" | "오후" | "저녁" | null;
}

/** 관리자용 명단 행 */
export interface GroupMemberRow {
  id: string;
  group_id: string;
  name: string;
  created_at: string;
}

export interface WaitingEntry {
  id: string;
  name: string;
  phone: string;
  created_at: string;
}

export interface Message {
  id: string;
  group_id: string | null;
  name: string;
  stamp: string | null;
  message: string | null;
  created_at: string;
}
