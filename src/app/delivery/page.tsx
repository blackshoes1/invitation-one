"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { groom, bride, DELIVERY_CAPACITY } from "@/lib/wedding";
import IntroAnimation from "@/components/delivery/IntroAnimation";
import BikeIcon from "@/components/delivery/BikeIcon";
import MenuSelect, { type DeliveryMode } from "@/components/delivery/MenuSelect";
import DeliveryForm from "@/components/delivery/DeliveryForm";
import InviteNotice from "@/components/delivery/InviteNotice";
import GroupSpaceCard from "@/components/delivery/GroupSpaceCard";
import { useInvite } from "@/components/delivery/useInvite";
import HeartForm from "@/components/delivery/HeartForm";
import RiderProfile from "@/components/delivery/RiderProfile";
import ReviewStrip from "@/components/delivery/ReviewStrip";
import FindOrder from "@/components/delivery/FindOrder";
import DeliveryClosed from "@/components/delivery/DeliveryClosed";
import Faq from "@/components/delivery/Faq";

function DeliveryPageInner() {
  const search = useSearchParams();
  /** 마음배송 → 직접배달 전환으로 들어온 참여자 id (?convert=) */
  const convertId = search.get("convert");
  /**
   * 개인 주문 초대 링크 (?i=) — 그룹에 묶이지 않는 본인 주문.
   * 이름·마스킹 번호만 프리필하고, 실제 연락처는 제출 시 서버가 토큰으로 채운다.
   */
  const inviteToken = search.get("i");
  // 개인 주문이라 어느 그룹의 토큰이든 신원 확인용으로 받는다 (그룹에는 묶지 않는다)
  const inviteState = useInvite(inviteToken, null);
  const { prefill: invite, token: usableToken, ready: inviteReady } = inviteState;

  /** 신청 인원 — 아직 못 불러왔으면 null (숫자가 0→실제값으로 튀지 않게) */
  const [taken, setTaken] = useState<number | null>(null);
  const [mode, setMode] = useState<DeliveryMode | null>(
    convertId || inviteToken ? "delivery" : null
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    (async () => {
      // 남은 자리 = 총 수량 - 직접배달 신청 인원 합계
      const { data } = await supabase!.rpc("get_delivery_guest_count");
      // 실패하면 null 유지 — 잘못된 숫자를 보여주느니 자리표시자를 유지한다
      if (typeof data === "number") setTaken(data);
    })();
  }, []);

  const loaded = taken !== null;
  const remaining = loaded ? Math.max(0, DELIVERY_CAPACITY - taken) : 0;
  // 아직 못 불러온 동안에는 마감 화면으로 넘어가지 않는다
  const closed = loaded && remaining <= 0;

  return (
    <div>
      <IntroAnimation />
      <header className="sticky top-0 z-20 bg-delivery text-white px-5 py-3 flex items-center shadow-sm">
        <span className="font-serif font-bold tracking-tight flex items-center gap-2">
          <BikeIcon className="w-6 h-6 text-white" />
          {groom.name}·{bride.name} 스토어
        </span>
      </header>

      <section className="px-6 pt-8 pb-6 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 160, damping: 12 }}
          className="flex justify-center"
        >
          <BikeIcon className="w-20 h-20 text-delivery" />
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
            📦 남은 자리{" "}
            {loaded ? (
              `${remaining}명`
            ) : (
              <span className="inline-block w-9 h-3 align-middle rounded-full bg-neutral-200 animate-pulse" />
            )}
          </span>
        </div>
      </section>

      <InviteNotice key={inviteToken ?? "none"} state={inviteState} token={inviteToken} />
      {invite?.groupSlug && usableToken && (
        <GroupSpaceCard key={usableToken} token={usableToken} invite={invite} />
      )}
      {!inviteReady ? (
        <div className="h-[40vh] flex items-center justify-center text-neutral-500 text-sm">
          불러오는 중…
        </div>
      ) : closed ? (
        /*
          마감은 **신규 직접배달 신청**에만 걸린다 (문제 7).
          이미 신청한 사람의 관리·복구까지 같이 사라지면, 정원이 찬 순간부터
          기존 하객이 취소·변경할 길이 없어진다 — 정원과 아무 상관이 없는 일이다.
          `?find=1` 로 들어온 경우엔 복구 UI 를 펼친 채로 보여준다.
        */
        <section className="pb-6">
          <DeliveryClosed />
          <FindOrder defaultOpen={search.get("find") === "1"} />
        </section>
      ) : (
        <section className="pb-6">
          {mode === null && (
            <>
              <RiderProfile deliveredCount={taken ?? undefined} />
              <ReviewStrip />
              <MenuSelect onPick={setMode} />
              <FindOrder defaultOpen={search.get("find") === "1"} />
            </>
          )}

          {mode !== null && (
            <div className="max-w-md mx-auto px-5">
              <button
                onClick={() => setMode(null)}
                className="text-xs text-neutral-500 mb-1"
              >
                ← 메뉴로 돌아가기
              </button>
            </div>
          )}
          {mode === "delivery" && (
            <DeliveryForm
              convertId={convertId}
              invite={invite}
              inviteToken={usableToken}
            />
          )}
          {mode === "heart" && (
            <HeartForm
              inviteName={invite?.name ?? null}
              onSwitchToDelivery={() => setMode("delivery")}
            />
          )}
        </section>
      )}

      <Faq />

      <footer className="text-center text-[11px] text-neutral-500 pb-8">
        청첩장배달 🛵 · {groom.name} ♥ {bride.name}
      </footer>
    </div>
  );
}

export default function DeliveryPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[60vh] flex items-center justify-center text-neutral-500 text-sm">
          불러오는 중…
        </div>
      }
    >
      <DeliveryPageInner />
    </Suspense>
  );
}
