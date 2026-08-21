import { type TimeSlot, INVITATION_KEY } from "@/lib/wedding";

export const SLOTS: TimeSlot[] = ["오전", "오후", "저녁"];

/** 마음 배송은 즉시 공개 — 키 포함 청첩장 링크 */
export const invitationHref = INVITATION_KEY ? `/?key=${INVITATION_KEY}` : "/";

export type Mode = "view" | "reschedule" | "switch" | "toHeart";
