"use client";

import { useEffect } from "react";
import { INVITATION_KEY } from "@/lib/wedding";
import { INVITATION_COOKIE, INVITATION_COOKIE_MAX_AGE } from "@/lib/inviteAccess";

/**
 * 청첩장이 열린 기기에 열람 쿠키를 남긴다 (방문할 때마다 기한 갱신).
 * 서버 컴포넌트는 쿠키를 읽기만 할 수 있어 쓰기는 클라이언트에서 처리한다.
 */
export default function RememberInvitationKey() {
  useEffect(() => {
    if (!INVITATION_KEY) return;
    try {
      document.cookie = `${INVITATION_COOKIE}=${encodeURIComponent(
        INVITATION_KEY
      )}; path=/; max-age=${INVITATION_COOKIE_MAX_AGE}; samesite=lax${
        location.protocol === "https:" ? "; secure" : ""
      }`;
    } catch {
      /* 쿠키 차단 환경 — 링크로 다시 들어오면 됨 */
    }
  }, []);
  return null;
}
