"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  supabase,
  isSupabaseConfigured,
  type Group,
  type GroupOrder,
} from "@/lib/supabase";
import { groom, bride, DELIVERY_CAPACITY } from "@/lib/wedding";
import MenuSelect, { type DeliveryMode } from "@/components/delivery/MenuSelect";
import BikeIcon from "@/components/delivery/BikeIcon";
import IntroAnimation from "@/components/delivery/IntroAnimation";
import DeliveryForm from "@/components/delivery/DeliveryForm";
import InviteNotice from "@/components/delivery/InviteNotice";
import GroupSpaceCard from "@/components/delivery/GroupSpaceCard";
import RosterIntroCard from "@/components/delivery/RosterIntroCard";
import { useInvite } from "@/components/delivery/useInvite";
import JoinForm from "@/components/delivery/JoinForm";
import OrderList from "@/components/delivery/OrderList";
import HeartForm from "@/components/delivery/HeartForm";
import ReviewStrip from "@/components/delivery/ReviewStrip";
import FindOrder from "@/components/delivery/FindOrder";
import DeliveryClosed from "@/components/delivery/DeliveryClosed";
import Faq from "@/components/delivery/Faq";
import { OfferCard, AcceptOfferForm } from "@/components/delivery/GroupOffer";

type View =
  | { kind: "menu" }
  | { kind: "join"; order: GroupOrder }
  | { kind: "new" }
  | { kind: "heart" }
  | { kind: "offer" };

function GroupPageInner() {
  const params = useParams<{ groupId: string }>();
  const search = useSearchParams();
  const slug = params.groupId;
  /** 마음배송 → 직접배달 전환으로 들어온 참여자 id (?convert=) */
  const convertId = search.get("convert");
  /** 개인 초대 링크 토큰 (?i=) — 이름·마스킹 번호 프리필, 제출 시 서버가 실제 번호 채움 */
  const inviteToken = search.get("i");
  // 이 그룹의 토큰만 쓴다. 다른 그룹·만료 토큰은 버리되 조용히 버리지 않고 안내한다.
  const inviteState = useInvite(inviteToken, slug);
  const { prefill: invite, token: usableToken, ready: inviteReady } = inviteState;

  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [orders, setOrders] = useState<GroupOrder[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  /** 신청 인원 — 아직 못 불러왔으면 null (숫자 튐 방지) */
  const [taken, setTaken] = useState<number | null>(null);
  const [view, setView] = useState<View>({ kind: "menu" });
  /**
   * 명단에서 고른 이름 — 아래 신청서들의 이름 기본값.
   * 초대 토큰으로 확인된 신원이 **아니므로** 이름 하나로만 쓴다 (연락처는 직접 입력).
   */
  const [pickedName, setPickedName] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setOrdersLoaded(true);
      return;
    }
    const [ordersRes, countRes] = await Promise.all([
      supabase.rpc("get_group_orders", { p_slug: slug }),
      supabase.rpc("get_delivery_guest_count"), // 남은 자리 = 총 수량 - 신청 인원
    ]);
    if (Array.isArray(ordersRes.data)) setOrders(ordersRes.data as GroupOrder[]);
    if (typeof countRes.data === "number") setTaken(countRes.data);
    setOrdersLoaded(true);
  }, [slug]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!isSupabaseConfigured || !supabase) {
        if (alive) setGroup({ id: "demo", name: "데모 그룹", slug });
        return;
      }
      const { data } = await supabase.rpc("get_group", { p_slug: slug });
      if (alive) setGroup(Array.isArray(data) && data[0] ? (data[0] as Group) : null);
    })();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders();
    return () => {
      alive = false;
    };
  }, [slug, loadOrders]);

  const seatsLoaded = taken !== null;
  const remaining = seatsLoaded ? Math.max(0, DELIVERY_CAPACITY - taken) : 0;
  // 아직 못 불러온 동안에는 마감 화면으로 넘어가지 않는다
  const closed = seatsLoaded && remaining <= 0;

  // 인트로는 세 분기 모두 같은 트리 위치(루트 div 첫 번째 자식)에 두어
  // 로딩 → 본문 전환 시 리마운트 없이 영상이 끊기지 않게 한다.
  if (group === undefined || !inviteReady) {
    return (
      <div>
        <IntroAnimation />
        <div className="h-[60vh] flex items-center justify-center text-neutral-500 text-sm">
          불러오는 중…
        </div>
      </div>
    );
  }

  if (group === null) {
    return (
      <div>
        <IntroAnimation />
        <div className="h-[70vh] flex flex-col items-center justify-center text-center px-8 gap-3">
          <div className="text-5xl">🔍</div>
          <p className="font-bold text-neutral-700">그룹을 찾을 수 없어요</p>
          <p className="text-xs text-neutral-500">링크를 다시 확인해 주세요.</p>
          <Link
            href="/delivery"
            className="mt-3 px-5 py-2.5 rounded-full bg-delivery text-white text-sm font-bold"
          >
            배달 메인으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <IntroAnimation />
      <header className="sticky top-0 z-20 bg-delivery text-white px-5 py-3 flex items-center shadow-sm">
        <span className="font-serif font-bold tracking-tight flex items-center gap-2">
          <BikeIcon className="w-6 h-6 text-white" />
          {groom.name}·{bride.name} 스토어
        </span>
      </header>

      <section className="px-6 pt-7 pb-5 text-center">
        <span className="inline-block text-[11px] bg-delivery-yellow/30 text-delivery-dark font-bold px-3 py-1 rounded-full">
          ⭐ 신규 오픈 · 무료배송
        </span>
        <h1 className="mt-3 text-2xl font-extrabold text-neutral-800">
          {group.name}
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          📦 남은 자리:{" "}
          {seatsLoaded ? (
            <span className="text-delivery font-bold">{remaining}명</span>
          ) : (
            <span className="inline-block w-9 h-3 align-middle rounded-full bg-neutral-200 animate-pulse" />
          )}
        </p>
      </section>

      <InviteNotice state={inviteState} token={inviteToken} />
      {invite?.groupSlug && usableToken && (
        <GroupSpaceCard key={usableToken} token={usableToken} invite={invite} />
      )}
      {/* 초대 링크로 들어온 사람은 이미 서버가 누군지 안다 — 고를 필요가 없다 */}
      {!invite && view.kind === "menu" && (
        <RosterIntroCard slug={slug} picked={pickedName} onPick={setPickedName} />
      )}

      {view.kind === "menu" && (
        <div className="px-6 pb-6 max-w-md mx-auto space-y-4">
          {group.offer_date && group.offer_time && !closed && (
            <OfferCard
              group={group}
              memberCount={
                orders.find(
                  (o) =>
                    o.id === group.offer_delivery_id &&
                    o.status !== "취소" &&
                    o.status !== "완료"
                )?.member_names.length ?? null
              }
              onAccept={() => setView({ kind: "offer" })}
            />
          )}
          <OrderList
            orders={orders}
            loaded={ordersLoaded}
            onJoin={(order) => setView({ kind: "join", order })}
            onPropose={() => setView({ kind: "new" })}
          />
        </div>
      )}

      {closed && view.kind === "new" ? (
        <DeliveryClosed />
      ) : (
        <section className="pb-6">
          {view.kind === "menu" && (
            <>
              <ReviewStrip />
              <MenuSelect
                onPick={(mode: DeliveryMode) =>
                  setView(mode === "delivery" ? { kind: "new" } : { kind: "heart" })
                }
              />
              <FindOrder />
            </>
          )}

          {view.kind !== "menu" && (
            <div className="max-w-md mx-auto px-5">
              <button
                onClick={() => setView({ kind: "menu" })}
                className="text-xs text-neutral-500 mb-1"
              >
                ← 주문 현황으로 돌아가기
              </button>
            </div>
          )}

          {view.kind === "offer" && (
            <AcceptOfferForm
              group={group}
              slug={slug}
              convertId={convertId}
              invite={invite}
              inviteToken={usableToken}
              nameDefault={pickedName}
              onBack={() => setView({ kind: "menu" })}
              onJoined={loadOrders}
            />
          )}
          {view.kind === "join" && (
            <JoinForm
              order={view.order}
              groupSlug={slug}
              convertId={convertId}
              invite={invite}
              inviteToken={usableToken}
              nameDefault={pickedName}
              onBack={() => setView({ kind: "menu" })}
              onJoined={loadOrders}
            />
          )}
          {view.kind === "new" && (
            <DeliveryForm
              group={{ id: group.id, name: group.name }}
              groupSlug={slug}
              convertId={convertId}
              invite={invite}
              inviteToken={usableToken}
              nameDefault={pickedName}
              onSubmitted={loadOrders}
            />
          )}
          {view.kind === "heart" && (
            <HeartForm
              group={{ id: group.id, name: group.name }}
              inviteName={invite?.name ?? null}
              groupSlug={slug}
              nameDefault={pickedName}
              onSwitchToDelivery={() => setView({ kind: "new" })}
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

export default function GroupPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[60vh] flex items-center justify-center text-neutral-500 text-sm">
          불러오는 중…
        </div>
      }
    >
      <GroupPageInner />
    </Suspense>
  );
}
