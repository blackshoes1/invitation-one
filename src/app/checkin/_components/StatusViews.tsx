"use client";

import { motion } from "framer-motion";

export function LoadingView() {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-sm text-neutral-500 py-8"
    >
      예약 정보를 확인하고 있어요…
    </motion.p>
  );
}

export function InvalidView() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-5 py-4"
    >
      <div className="text-4xl">🙏</div>
      <p className="text-base text-sage-700 font-medium leading-relaxed">
        QR 을 확인하지 못했어요.
      </p>
      <p className="text-sm text-neutral-500 leading-relaxed">
        링크가 만료되었거나 잘못된 QR 일 수 있어요.
        <br />
        예식장에 있는 공용 QR 을 스캔하시거나
        <br />
        안내데스크에 문의해 주세요.
      </p>
    </motion.div>
  );
}

export function GuideView() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-5 py-4"
    >
      <div className="text-4xl">📷</div>
      <p className="text-base text-sage-700 font-medium leading-relaxed">
        체크인은 QR 로 진행돼요.
      </p>
      <p className="text-sm text-neutral-500 leading-relaxed">
        받으신 개인 QR 또는 예식장에 있는
        <br />
        공용 QR 을 스캔해 주세요.
        <br />
        도움이 필요하면 안내데스크로 와주세요.
      </p>
    </motion.div>
  );
}
