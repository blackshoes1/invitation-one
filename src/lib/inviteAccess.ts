import { INVITATION_KEY } from "@/lib/wedding";

/**
 * 청첩장 열람 기억 (재방문 UX).
 * 유효한 ?key= 로 한 번 들어온 기기에 쿠키를 남겨, 다음엔 주소만 열어도 바로 보이게 한다.
 * INVITATION_KEY 는 비밀값이 아니라 "링크를 받은 사람만" 수준의 게이트이므로,
 * 이미 유효한 키로 들어온 기기에만 남는 이 쿠키가 게이트를 약화시키지 않는다.
 * (키를 교체하면 값이 달라져 기존 쿠키는 자동으로 무효)
 */
export const INVITATION_COOKIE = "inv_key";
export const INVITATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180일

/** 키가 포함된 청첩장 경로 — 링크로 전달·저장해도 바로 열린다 */
export const invitationHref = INVITATION_KEY ? `/?key=${INVITATION_KEY}` : "/";
