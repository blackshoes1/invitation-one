"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const SEEN_KEY = "delivery-intro-seen";

/**
 * 배달 메인 첫 진입 인트로 — 세션당 1회 재생
 * - 신랑신부 인트로 영상(/intro.mp4): 스쿠터가 화면 끝까지 달려 나가면 메인 등장
 * - 자동재생을 위해 음소거 재생 (모바일 정책)
 * - 영상 로드 실패 시 기존 🛵 + "배송 출발!" 도장 애니메이션으로 폴백
 * - 느린 회선에서 영상이 스톨해도 최대 8초 후 자동 종료
 */
export default function IntroAnimation() {
  const [show, setShow] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    // 같은 세션에서 뒤로가기 등으로 재진입하면 반복 재생하지 않음
    try {
      if (sessionStorage.getItem(SEEN_KEY) === "1") return;
    } catch {
      /* 프라이빗 모드 등 — 그냥 재생 */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true);
  }, []);

  const close = () => {
    setShow(false);
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* 무시 */
    }
  };

  // 폴백(이모지 애니메이션)은 2초, 영상은 스톨 대비 최대 8초 후 자동 종료
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(close, videoFailed ? 2000 : 8000);
    return () => clearTimeout(t);
  }, [show, videoFailed]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-delivery flex items-center justify-center overflow-hidden"
          onClick={close}
        >
          {!videoFailed ? (
            <>
              <video
                src="/intro.mp4"
                autoPlay
                muted
                playsInline
                onEnded={close}
                onError={() => setVideoFailed(true)}
                className="w-full h-full object-cover"
              />
              <motion.div
                initial={{ scale: 0, rotate: -25, opacity: 0 }}
                animate={{ scale: 1, rotate: -12, opacity: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 12 }}
                className="absolute top-8 left-1/2 -translate-x-1/2 px-4 py-1.5 border-[3px] border-white rounded-xl text-white text-lg font-extrabold pointer-events-none"
              >
                배송 출발! 🛵
              </motion.div>
            </>
          ) : (
            <>
              <motion.div
                initial={{ x: "-120%" }}
                animate={{ x: 0 }}
                transition={{ type: "spring", stiffness: 90, damping: 14 }}
                className="text-7xl"
              >
                🛵
              </motion.div>
              <motion.div
                initial={{ scale: 0, rotate: -25, opacity: 0 }}
                animate={{ scale: 1, rotate: -12, opacity: 1 }}
                transition={{ delay: 0.7, type: "spring", stiffness: 260, damping: 12 }}
                className="absolute px-6 py-2 border-4 border-white rounded-xl text-white text-2xl font-extrabold"
              >
                배송 출발!
              </motion.div>
            </>
          )}

          <button
            onClick={close}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/30 text-white/90 text-xs"
          >
            건너뛰기 ›
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
