"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

/** 첫 진입 시 1회 노출되는 배달 서비스 안내 팝업 */
export default function IntroPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seen = sessionStorage.getItem("intro-popup-seen");
    if (!seen) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  const close = () => {
    sessionStorage.setItem("intro-popup-seen", "1");
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 px-8"
          onClick={close}
        >
          <motion.div
            initial={{ scale: 0.85, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[300px] bg-white rounded-3xl overflow-hidden shadow-xl text-center"
          >
            <div className="bg-delivery pt-6 pb-5 text-white">
              <div className="text-5xl">🛵</div>
              <p className="mt-2 text-lg font-extrabold">청첩장, 배달도 돼요!</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-neutral-500 leading-relaxed">
                신랑신부가 직접 찾아가
                <br />
                청첩장을 전해드려요 💌
                <br />
                <span className="text-delivery font-bold">배달비는 0원!</span>
              </p>
              <Link
                href="/delivery"
                onClick={close}
                className="block w-full py-3.5 rounded-full bg-delivery text-white font-extrabold active:scale-95 transition-transform"
              >
                지금 바로 주문하기 🛵
              </Link>
              <button
                onClick={close}
                className="text-xs text-neutral-400 underline underline-offset-2"
              >
                청첩장 먼저 볼게요
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
