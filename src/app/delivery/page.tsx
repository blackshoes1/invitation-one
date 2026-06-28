"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { groom, bride } from "@/lib/wedding";
import DeliveryForm from "@/components/delivery/DeliveryForm";

export default function DeliveryPage() {
  const formRef = useRef<HTMLDivElement>(null);
  const scrollToForm = () =>
    formRef.current?.scrollIntoView({ behavior: "smooth" });

  return (
    <div>
      {/* 상단 바 */}
      <header className="sticky top-0 z-20 bg-delivery text-white px-5 py-3 flex items-center justify-between shadow-sm">
        <span className="font-extrabold tracking-tight">청첩장배달 🛵</span>
        <Link
          href="/"
          className="text-xs bg-white/20 px-3 py-1.5 rounded-full font-medium"
        >
          💌 청첩장
        </Link>
      </header>

      {/* 히어로 (배달앱 패러디) */}
      <section className="px-6 pt-10 pb-12 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 160, damping: 12 }}
          className="text-7xl"
        >
          🛵
        </motion.div>
        <h1 className="mt-4 text-3xl font-extrabold text-neutral-800 leading-tight">
          청첩장도 배달이
          <br />
          되나요? <span className="text-delivery">네, 됩니다!</span>
        </h1>
        <p className="mt-3 text-sm text-neutral-500 leading-relaxed">
          {groom.name} · {bride.name} 라이더가
          <br />
          직접 찾아가 청첩장을 전해드려요 💌
        </p>

        {/* 배지 */}
        <div className="mt-5 flex justify-center gap-2 flex-wrap">
          {["🚀 전국 배달", "💸 배달비 0원", "⭐ 별점 5.0"].map((b) => (
            <span
              key={b}
              className="text-xs bg-white border border-delivery/15 text-neutral-600 px-3 py-1.5 rounded-full font-medium"
            >
              {b}
            </span>
          ))}
        </div>

        <button
          onClick={scrollToForm}
          className="mt-8 w-full max-w-xs py-4 rounded-full bg-delivery text-white font-extrabold shadow-md active:scale-95 transition-transform"
        >
          지금 바로 주문하기 🛵
        </button>
      </section>

      {/* 메뉴판 패러디 */}
      <section className="px-6 pb-10">
        <div className="max-w-md mx-auto bg-white rounded-2xl border border-delivery/10 p-5 space-y-4">
          <h2 className="text-sm font-extrabold text-neutral-800">
            📋 오늘의 메뉴
          </h2>
          {[
            {
              emoji: "💌",
              name: "정성 가득 청첩장 배달",
              desc: "신랑신부가 직접 전해드리는 시그니처 메뉴",
              price: "₩0",
            },
            {
              emoji: "☕",
              name: "만나서 차 한잔 (옵션)",
              desc: "편하신 곳에서 짧게 인사 나눠요",
              price: "정(情)",
            },
          ].map((m) => (
            <div key={m.name} className="flex gap-3 items-start">
              <span className="text-2xl">{m.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-neutral-800">{m.name}</p>
                <p className="text-xs text-neutral-400">{m.desc}</p>
              </div>
              <span className="text-sm font-extrabold text-delivery">
                {m.price}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 주문 폼 */}
      <section ref={formRef} className="pt-2 pb-12 scroll-mt-14">
        <div className="px-6 mb-2 text-center">
          <h2 className="text-lg font-extrabold text-neutral-800">
            🧾 주문서 작성
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            6단계면 주문 끝! 금방 끝나요 😊
          </p>
        </div>
        <DeliveryForm />
      </section>

      <footer className="text-center text-[11px] text-neutral-400 pb-8">
        청첩장배달 🛵 · {groom.name} ♥ {bride.name}
      </footer>
    </div>
  );
}
