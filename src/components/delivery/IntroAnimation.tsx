"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * 배달 메인 첫 진입 인트로 (세션 1회)
 * - 신랑신부가 준비한 인트로 영상(/intro.mp4) 재생 → 끝나면 자동으로 메인 등장
 * - 자동재생을 위해 음소거 재생 (모바일 정책)
 * - 영상 로드 실패 시 기존 🛵 + "배송 출발!" 도장 애니메이션으로 폴백
 */
export default function IntroAnimation() {
  const [show, setShow] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  const close = () => {
    sessionStorage.setItem("delivery-intro-seen", "1");
    setShow(false);
  };

  useEffect(() => {
    if (sessionStorage.getItem("delivery-intro-seen")) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true);
  }, []);

  // 폴백(이모지 애니메이션)일 때만 타이머로 자동 종료
  useEffect(() => {
    if (!show || !videoFailed) return;
    const t = setTimeout(() => {
      sessionStorage.setItem("delivery-intro-seen", "1");
      setShow(false);
    }, 2000);
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
                className="w-full h-full object-contain"
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
