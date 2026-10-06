"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import ManualShareLink from "@/components/ManualShareLink";
import { copyShareLink, isMobileShareDevice } from "@/lib/shareLink";
import {
  groom,
  bride,
  venue,
  formatFullDate,
  formatTime,
  INVITATION_KEY,
} from "@/lib/wedding";

// 카카오 JS SDK 전역
declare global {
  interface Window {
    // 공식 타입 패키지가 없어 런타임 전역으로 사용
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Kakao?: any;
  }
}

// 지도/공유 모두 JavaScript 키 사용
const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

/**
 * 카카오톡 공유 버튼 (FD-2).
 * 카카오 SDK 로 대표 사진·이름·날짜·[청첩장 보기] 버튼이 담긴 피드 카드를 전송.
 * 키 미설정/SDK 실패 시 링크 복사로 폴백.
 */
export default function ShareButton() {
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);

  useEffect(() => {
    if (!KAKAO_JS_KEY) return;
    const SCRIPT_ID = "kakao-sdk";
    const init = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) {
        window.Kakao.init(KAKAO_JS_KEY);
      }
      if (window.Kakao?.isInitialized()) setReady(true);
    };
    if (window.Kakao) return init();
    if (document.getElementById(SCRIPT_ID)) {
      document.getElementById(SCRIPT_ID)!.addEventListener("load", init);
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js";
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, []);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  };

  const shareLink = () => {
    const url = `${window.location.origin}/${
      INVITATION_KEY ? `?key=${INVITATION_KEY}` : ""
    }`;
    return url;
  };

  const onShare = async (copyOnly = false) => {
    const url = shareLink();
    setManualLink(null);
    setToast(null);
    const desc = `${formatFullDate()} ${formatTime()} · 서울 ${venue.name}`;
    // 카카오 SDK 준비되면 피드 카드, 아니면 링크 복사 폴백
    if (!copyOnly && isMobileShareDevice() && ready && window.Kakao?.Share) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: "feed",
          content: {
            title: `${groom.name} ♥ ${bride.name} 결혼합니다`,
            description: desc,
            imageUrl: `${window.location.origin}/pic/wedding_main.jpg`,
            link: { mobileWebUrl: url, webUrl: url },
          },
          buttons: [
            {
              title: "청첩장 보기",
              link: { mobileWebUrl: url, webUrl: url },
            },
          ],
        });
        return;
      } catch {
        /* 폴백 */
      }
    }
    // 폴백: 링크 복사
    if (await copyShareLink(url)) {
      flash("링크를 복사했어요! 붙여넣어 공유해주세요 💌");
    } else setManualLink(url);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => onShare()}
        className="inline-flex items-center gap-1.5 px-4 py-2 border border-wedding-gold/30 text-xs text-sage-700 tracking-wide hover:bg-sage-50 transition-colors"
      >
        <Share2 size={13} className="text-wedding-gold" />
        청첩장 공유하기
      </button>
      <button type="button" onClick={() => onShare(true)} className="text-xs text-sage-700 underline underline-offset-2 py-2">청첩장 링크 복사</button>
      {toast && (
        <span role="status" className="text-xs text-sage-600">
          {toast}
        </span>
      )}
      {manualLink && <ManualShareLink url={manualLink} />}
    </div>
  );
}
