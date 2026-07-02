"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { groom, bride, DELIVERY_CAPACITY } from "@/lib/wedding";
import IntroAnimation from "@/components/delivery/IntroAnimation";
import MenuSelect, { type DeliveryMode } from "@/components/delivery/MenuSelect";
import DeliveryForm from "@/components/delivery/DeliveryForm";
import HeartForm from "@/components/delivery/HeartForm";
import ReviewStrip from "@/components/delivery/ReviewStrip";
import DeliveryClosed from "@/components/delivery/DeliveryClosed";
import Faq from "@/components/delivery/Faq";

function DeliveryPageInner() {
  const search = useSearchParams();
  /** 마음배송 → 직접배달 전환으로 들어온 참여자 id (?convert=) */
  const convertId = search.get("convert");

  const [taken, setTaken] = useState(0);
  const [mode, setMode] = useState<DeliveryMode | null>(
    convertId ? "delivery" : null
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    (async () => {
      const { data } = await supabase!.rpc("get_booked_dates");
      if (Array.isArray(data)) setTaken(data.length);
    })();
  }, []);

  const remaining = Math.max(0, DELIVERY_CAPACITY - taken);
  const closed = remaining <= 0;

  return (
    <div>
      <IntroAnimation />
      <header className="sticky top-0 z-20 bg-delivery text-white px-5 py-3 flex items-center justify-between shadow-sm">
        <span className="font-serif font-bold tracking-tight">
          🛵 {groom.name}·{bride.name} 스토어
        </span>
        <Link href="/" className="text-xs bg-white/20 px-3 py-1.5 rounded-full font-medium">
          💌 청첩장
        </Link>
      </header>

      <section className="px-6 pt-8 pb-6 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 160, damping: 12 }}
          className="text-6xl"
        >
          🛵
        </motion.div>
        <p className="mt-3 text-sm text-neutral-500">
          <span className="font-serif text-wedding-gold font-medium">
            {groom.name} · {bride.name}
          </span>{" "}
          청첩장을 직접 전해드려요
        </p>
        <div className="mt-4 flex justify-center gap-2 flex-wrap">
          <span className="text-xs bg-delivery-yellow/30 text-delivery-dark px-3 py-1.5 rounded-full font-bold">
            ⭐ 신규 오픈 · 무료배송
          </span>
          <span className="text-xs bg-white border border-delivery/15 text-neutral-600 px-3 py-1.5 rounded-full font-medium">
            📦 남은 자리 {remaining}개
          </span>
        </div>
      </section>

      {closed ? (
        <DeliveryClosed />
      ) : (
        <section className="pb-6">
          {mode === null && (
            <>
              <ReviewStrip />
              <MenuSelect onPick={setMode} />
            </>
          )}

          {mode !== null && (
            <div className="max-w-md mx-auto px-5">
              <button
                onClick={() => setMode(null)}
                className="text-xs text-neutral-400 mb-1"
              >
                ← 메뉴로 돌아가기
              </button>
            </div>
          )}
          {mode === "delivery" && <DeliveryForm convertId={convertId} />}
          {mode === "heart" && (
            <HeartForm onSwitchToDelivery={() => setMode("delivery")} />
          )}
        </section>
      )}

      <Faq />

      <footer className="text-center text-[11px] text-neutral-400 pb-8">
        청첩장배달 🛵 · {groom.name} ♥ {bride.name}
      </footer>
    </div>
  );
}

export default function DeliveryPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[60vh] flex items-center justify-center text-neutral-400 text-sm">
          불러오는 중…
        </div>
      }
    >
      <DeliveryPageInner />
    </Suspense>
  );
}
