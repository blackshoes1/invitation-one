"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/** 배달 메인 첫 진입 인트로 (세션 1회): 🛵 + "배송 출발!" 도장 */
export default function IntroAnimation() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem("delivery-intro-seen")) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(true);
    const t = setTimeout(() => {
      sessionStorage.setItem("delivery-intro-seen", "1");
      setShow(false);
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    sessionStorage.setItem("delivery-intro-seen", "1");
    setShow(false);
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-delivery flex items-center justify-center overflow-hidden"
          onClick={close}
        >
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

          <button
            onClick={close}
            className="absolute bottom-8 text-white/80 text-xs underline"
          >
            건너뛰기
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
