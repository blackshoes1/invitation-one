"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { invitationHref } from "@/lib/inviteAccess";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { groom, bride, DELIVERY_CAPACITY } from "@/lib/wedding";
import BikeIcon from "@/components/delivery/BikeIcon";
import MenuSelect, { type DeliveryMode } from "@/components/delivery/MenuSelect";
import DeliveryForm from "@/components/delivery/DeliveryForm";
import InviteNotice from "@/components/delivery/InviteNotice";
import GroupSpaceCard from "@/components/delivery/GroupSpaceCard";
import { useInvite } from "@/components/delivery/useInvite";
import HeartForm from "@/components/delivery/HeartForm";
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
    convertId ? "delivery" : null
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
      <header className="sticky top-0 z-20 bg-delivery text-white px-5 py-3 flex items-center shadow-sm">
        <span className="font-serif font-bold tracking-tight flex items-center gap-2">
          <BikeIcon className="w-6 h-6 text-white" />
          {groom.name}·{bride.name} 청첩장 배달
        </span>
      </header>

      <section className="max-w-md mx-auto px-5 pt-6 pb-4">
        <h1 className="text-2xl font-extrabold text-neutral-800">청첩장을 직접 전해드려요 🛵</h1>
        <p className="mt-2 text-sm text-neutral-600">지역과 날짜·시간을 고르면 돼요.<br />결혼식 참석 응답과는 별개예요.</p>
        <p className="mt-2 text-xs text-neutral-500">무료로 전해드려요{loaded ? ` · 남은 자리 ${remaining}명` : ""}</p>
      </section>

      <InviteNotice key={inviteToken ?? "none"} state={inviteState} token={inviteToken} />
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
              <MenuSelect onPick={setMode} />
              <div className="max-w-md mx-auto px-5 pt-4 text-center">
                <Link href={invitationHref} className="inline-block py-3 text-sm text-neutral-600 underline underline-offset-4">모바일 청첩장 보기</Link>
              </div>
              <FindOrder defaultOpen={search.get("find") === "1"} />
            </>
          )}

          {mode !== null && (
            <div className="max-w-md mx-auto px-5">
              <button
                onClick={() => setMode(null)}
                className="text-xs text-neutral-500 mb-1"
              >
                ← 다른 방법으로 받기
              </button>
            </div>
          )}
          {mode === "delivery" && (
            <DeliveryForm
              key={`${usableToken ?? "none"}:${convertId ?? "none"}`}
              convertId={convertId}
              invite={invite}
              inviteToken={usableToken}
            />
          )}
          {mode === "heart" && (
            <HeartForm
              key={usableToken ?? "none"}
              inviteName={invite?.name ?? null}
              inviteToken={usableToken}
              invitePhoneMasked={invite?.phoneMasked ?? null}
              onSwitchToDelivery={() => setMode("delivery")}
            />
          )}
        </section>
      )}

      {invite?.groupSlug && usableToken && (
        <GroupSpaceCard key={usableToken} token={usableToken} invite={invite} />
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
